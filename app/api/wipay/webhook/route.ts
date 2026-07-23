import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sendPaidBookingEmailsForInquiry } from "@/lib/email/workflows";
import {
  calculatePaymentSettlement,
  getWiPayPaymentByOrderId,
  isSuccessfulWiPayPayment,
  updateWiPayPaymentByOrderId,
  verifyWiPayWebhookSignature,
  type WiPayPaymentStatus,
} from "@/lib/payments/wipay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeStatus(value: unknown): WiPayPaymentStatus {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (status === "success") {
    return "success";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "cancelled") {
    return "cancelled";
  }

  if (status === "refunded") {
    return "refunded";
  }

  if (status === "error") {
    return "error";
  }

  return "pending";
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const signature = request.headers.get("wipay-signature") ?? request.headers.get("wipay_signature");

    if (!verifyWiPayWebhookSignature(payload, signature)) {
      return NextResponse.json({ ok: false, error: "Signature Verification Mismatch" }, { status: 401 });
    }

    const orderId = typeof payload.order_id === "string" ? payload.order_id.trim() : "";
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing order_id" }, { status: 400 });
    }

    const existingPayment = await getWiPayPaymentByOrderId(orderId);
    if (!existingPayment) {
      return NextResponse.json({ ok: false, error: "Unknown order_id" }, { status: 404 });
    }

    const status = normalizeStatus(payload.status);
    const transactionId = typeof payload.transaction_id === "string" ? payload.transaction_id.trim() : null;
    const now = new Date().toISOString();

    await updateWiPayPaymentByOrderId(orderId, {
      transaction_id: transactionId,
      status,
      webhook_payload: {
        ...(existingPayment.webhook_payload ?? {}),
        ...payload,
        settlement: calculatePaymentSettlement(
          typeof payload.total === "string" ? payload.total : existingPayment.amount,
        ),
      },
      paid_at: status === "success" ? now : null,
      cancelled_at: status === "cancelled" ? now : null,
      refunded_at: status === "refunded" ? now : null,
      failed_at: status === "failed" || status === "error" ? now : null,
    });

    if (status === "success" && !isSuccessfulWiPayPayment(existingPayment.status)) {
      const emailResult = await sendPaidBookingEmailsForInquiry({
        inquiryId: existingPayment.inquiry_id,
        orderId,
        amount: typeof payload.total === "string" ? payload.total : existingPayment.amount,
        paidAt: now,
      }).catch((error) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Unable to send paid booking emails.",
      }));

      if (!emailResult.ok) {
        console.error("WiPay webhook paid email warning", {
          inquiryId: existingPayment.inquiry_id,
          orderId,
          error: "error" in emailResult ? emailResult.error : "Paid booking emails were not sent.",
        });
      }
    }

    revalidatePath("/ConfirmationPage");
    revalidatePath("/TravellerProfile");
    revalidatePath("/OperatorDashboard");
    revalidatePath("/AdminBookings");

    return NextResponse.json({ ok: true, received: true });
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
