import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { sendPaidBookingEmailsForInquiry } from "@/lib/email/workflows";
import {
  calculatePaymentSettlement,
  getWiPayPaymentByOrderId,
  getWiPayWebhookSecret,
  isWiPayWebhookTimestampFresh,
  parseWiPayAmount,
  transitionWiPayPaymentByOrderId,
  verifyWiPayWebhookSignature,
  type WiPayCanonicalPaymentStatus,
} from "@/lib/payments/wipay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

type WiPayWebhookEnvelope = {
  id: string;
  api_family: "payments_api";
  event: string;
  occurred_at: string;
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
};

const WEBHOOK_EVENT_STATUS: Readonly<Record<string, WiPayCanonicalPaymentStatus>> = {
  "payment.created": "initiated",
  "payment.success": "paid",
  "payment.failed": "failed",
  "payment.error": "failed",
  "payment.refunded": "refunded",
  "payment.chargeback_processed": "refunded",
  "payment.fraud_confirmed": "refunded",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseWebhookEnvelope(rawBody: string): WiPayWebhookEnvelope | null {
  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (!isRecord(body) || !isRecord(body.data) || !isRecord(body.meta)) {
    return null;
  }

  const id = getString(body.id);
  const apiFamily = getString(body.api_family);
  const event = getString(body.event);
  const occurredAt = getString(body.occurred_at);

  if (
    !isUuid(id) ||
    apiFamily !== "payments_api" ||
    !event.startsWith("payment.") ||
    !occurredAt ||
    !Number.isFinite(Date.parse(occurredAt))
  ) {
    return null;
  }

  return {
    id,
    api_family: "payments_api",
    event,
    occurred_at: occurredAt,
    data: body.data,
    meta: body.meta,
  };
}

async function readBoundedRawBody(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return null;
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_WEBHOOK_BODY_BYTES) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = getWiPayWebhookSecret();
    if (!webhookSecret) {
      return NextResponse.json(
        { ok: false, error: "WiPay webhook verification is not configured." },
        { status: 503 },
      );
    }

    const rawBody = await readBoundedRawBody(request);
    if (rawBody === null) {
      return NextResponse.json({ ok: false, error: "Webhook body is invalid or too large." }, { status: 413 });
    }

    const signature = request.headers.get("x-wipay-webhook-signature");
    if (!verifyWiPayWebhookSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ ok: false, error: "Signature verification mismatch." }, { status: 401 });
    }

    const timestamp = request.headers.get("x-wipay-webhook-timestamp");
    if (!isWiPayWebhookTimestampFresh(timestamp)) {
      return NextResponse.json({ ok: false, error: "Webhook timestamp is outside the replay window." }, { status: 401 });
    }

    const envelope = parseWebhookEnvelope(rawBody);
    if (!envelope) {
      return NextResponse.json({ ok: false, error: "Invalid webhook envelope." }, { status: 400 });
    }

    const headerId = getString(request.headers.get("x-wipay-webhook-id"));
    const headerEvent = getString(request.headers.get("x-wipay-webhook-event"));
    const headerVersion = getString(request.headers.get("x-wipay-webhook-version"));
    if (
      headerVersion !== "v1" ||
      !isUuid(headerId) ||
      headerId.toLowerCase() !== envelope.id.toLowerCase() ||
      !headerEvent ||
      headerEvent !== envelope.event
    ) {
      return NextResponse.json({ ok: false, error: "Webhook headers do not match the envelope." }, { status: 400 });
    }

    const status = WEBHOOK_EVENT_STATUS[envelope.event];
    if (!status) {
      return NextResponse.json({
        ok: true,
        received: true,
        ignored: "unsupported-lifecycle-event",
        event: envelope.event,
      });
    }

    const orderId = getString(envelope.data.order_id);
    const dataTransactionId = getString(envelope.data.transaction_id);
    const metaTransactionId = getString(envelope.meta.transaction_id);
    const transactionId = dataTransactionId || metaTransactionId;
    if (
      !orderId ||
      !transactionId ||
      (dataTransactionId && metaTransactionId && dataTransactionId !== metaTransactionId)
    ) {
      return NextResponse.json({ ok: false, error: "Webhook payment identifiers are invalid." }, { status: 400 });
    }

    const existingPayment = await getWiPayPaymentByOrderId(orderId);
    if (!existingPayment) {
      return NextResponse.json({ ok: false, error: "Unknown order_id." }, { status: 404 });
    }

    if (existingPayment.transaction_id && existingPayment.transaction_id !== transactionId) {
      return NextResponse.json({ ok: false, error: "Transaction id does not match this order." }, { status: 409 });
    }

    const callbackAmount = parseWiPayAmount(
      typeof envelope.data.total === "string" || typeof envelope.data.total === "number"
        ? String(envelope.data.total)
        : null,
    );
    const expectedAmount = parseWiPayAmount(existingPayment.amount);
    if (
      status === "paid" &&
      (!callbackAmount ||
        !expectedAmount ||
        Number.parseFloat(callbackAmount) < Number.parseFloat(expectedAmount))
    ) {
      return NextResponse.json({ ok: false, error: "Payment amount mismatch." }, { status: 400 });
    }

    const eventCurrency = getString(envelope.data.currency).toUpperCase();
    if (eventCurrency && eventCurrency !== existingPayment.currency.toUpperCase()) {
      return NextResponse.json({ ok: false, error: "Payment currency mismatch." }, { status: 400 });
    }

    const transition = await transitionWiPayPaymentByOrderId({
      orderId,
      status,
      transactionId,
      webhookPayload: {
        ...envelope,
        delivery: {
          id: envelope.id,
          event: envelope.event,
          timestamp,
          version: headerVersion,
        },
        settlement: calculatePaymentSettlement(existingPayment.amount),
        original_total: expectedAmount,
      },
      knownPayment: existingPayment,
      allowDirectRefund: status === "refunded",
    });

    if (transition.paidClaimed) {
      const emailResult = await sendPaidBookingEmailsForInquiry({
        inquiryId: transition.payment.inquiry_id,
        orderId,
        amount: transition.payment.amount,
        paidAt: transition.payment.paid_at ?? new Date().toISOString(),
      }).catch((error) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Unable to send paid booking emails.",
      }));

      if (!emailResult.ok) {
        console.error("WiPay webhook paid email warning", {
          inquiryId: transition.payment.inquiry_id,
          orderId,
          error: "error" in emailResult ? emailResult.error : "Paid booking emails were not sent.",
        });
      }
    }

    if (transition.transitionApplied) {
      revalidatePath("/ConfirmationPage");
      revalidatePath("/TravellerProfile");
      revalidatePath("/OperatorDashboard");
      revalidatePath("/AdminBookings");
    }

    return NextResponse.json({
      ok: true,
      received: true,
      event: envelope.event,
      status: transition.currentStatus,
      transitionApplied: transition.transitionApplied,
    });
  } catch (error) {
    console.error("WiPay webhook error", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to process WiPay webhook.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}
