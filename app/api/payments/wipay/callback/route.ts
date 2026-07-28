import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sendPaidBookingEmailsForInquiry } from "@/lib/email/workflows";
import {
  calculatePaymentSettlement,
  getWiPayPaymentByOrderId,
  normalizeWiPayCallbackStatus,
  parseWiPayAmount,
  transitionWiPayPaymentByOrderId,
  verifyWiPayCallbackHash,
} from "@/lib/payments/wipay";
import { getInquiryConfirmation } from "@/lib/supabase/inquiry";
import { recordPlatformNotification } from "@/lib/supabase/notifications";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CallbackPayload = {
  order_id: string;
  status: string;
  transaction_id: string | null;
  total: string | null;
  currency: string | null;
  message: string | null;
  hash: string | null;
  date: string | null;
  card: string | null;
  data: Record<string, unknown> | null;
};

function getString(value: FormDataEntryValue | string | unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildTravellerRedirect(request: NextRequest, params: { inquiryId?: string; orderId?: string; payment: string; error?: string }) {
  const target = new URL("/TravellerProfile", request.url);

  if (params.inquiryId) {
    target.searchParams.set("inquiryId", params.inquiryId);
  }

  if (params.orderId) {
    target.searchParams.set("order_id", params.orderId);
  }

  target.searchParams.set("payment", params.payment);

  if (params.error) {
    target.searchParams.set("payment_error", params.error);
  }

  return target;
}

function redirectToTraveller(
  request: NextRequest,
  params: { inquiryId?: string; orderId?: string; payment: string; error?: string },
) {
  // A 303 also makes legacy POST responses safe to follow without replaying
  // the provider payload against the destination page.
  return NextResponse.redirect(buildTravellerRedirect(request, params), 303);
}

async function canApplyUnsignedBrowserOutcome(inquiryId: string) {
  const profileContext = await getOptionalCurrentUserProfile().catch(() => null);
  if (!profileContext || profileContext.profile.role !== "traveler") {
    return false;
  }

  return Boolean(await getInquiryConfirmation(inquiryId, profileContext.profile).catch(() => null));
}

async function readCallbackPayload(request: NextRequest): Promise<CallbackPayload> {
  if (request.method === "GET") {
    const params = request.nextUrl.searchParams;
    return {
      order_id: getString(params.get("order_id")),
      status: getString(params.get("status")),
      transaction_id: getString(params.get("transaction_id")) || null,
      total: getString(params.get("total")) || null,
      currency: getString(params.get("currency")) || null,
      message:
        getString(params.get("message")) ||
        getString(params.get("reasonDescription")) ||
        getString(params.get("reason")) ||
        null,
      hash: getString(params.get("hash")) || null,
      date: getString(params.get("date")) || null,
      card: getString(params.get("card")) || null,
      data: null,
    };
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return {
      order_id: getString(body?.order_id),
      status: getString(body?.status),
      transaction_id: getString(body?.transaction_id) || null,
      total: getString(body?.total) || null,
      currency: getString(body?.currency) || null,
      message:
        getString(body?.message) ||
        getString(body?.reasonDescription) ||
        getString(body?.reason) ||
        null,
      hash: getString(body?.hash) || null,
      date: getString(body?.date) || null,
      card: getString(body?.card) || null,
      data: body?.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null,
    };
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return {
      order_id: "",
      status: "",
      transaction_id: null,
      total: null,
      currency: null,
      message: null,
      hash: null,
      date: null,
      card: null,
      data: null,
    };
  }

  const dataValue = formData.get("data");
  let data: Record<string, unknown> | null = null;
  if (typeof dataValue === "string" && dataValue.trim()) {
    try {
      data = JSON.parse(dataValue) as Record<string, unknown>;
    } catch {
      data = { raw: dataValue };
    }
  }

  return {
    order_id: getString(formData.get("order_id")),
    status: getString(formData.get("status")),
    transaction_id: getString(formData.get("transaction_id")) || null,
    total: getString(formData.get("total")) || null,
    currency: getString(formData.get("currency")) || null,
    message:
      getString(formData.get("message")) ||
      getString(formData.get("reasonDescription")) ||
      getString(formData.get("reason")) ||
      null,
    hash: getString(formData.get("hash")) || null,
    date: getString(formData.get("date")) || null,
    card: getString(formData.get("card")) || null,
    data,
  };
}

async function loadPaymentContext(inquiryId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("inquiries")
    .select("id,user_id,operator_id,operator_name,traveler_name,destination,destination_country,listing_id")
    .eq("id", inquiryId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as {
    id: string;
    user_id: string | null;
    operator_id: string | null;
    operator_name: string | null;
    traveler_name: string | null;
    destination: string | null;
    destination_country: string | null;
    listing_id: string | null;
  };
}

export async function GET(request: NextRequest) {
  return handleProviderResponse(request);
}

async function handleProviderResponse(request: NextRequest) {
  try {
    const payload = await readCallbackPayload(request);
    const orderId = payload.order_id;

    if (!orderId) {
      return redirectToTraveller(request, { payment: "failed", error: "Missing WiPay order id." });
    }

    const existingPayment = await getWiPayPaymentByOrderId(orderId);
    if (!existingPayment) {
      return redirectToTraveller(request, {
        payment: "failed",
        orderId,
        error: "We could not match that WiPay payment.",
      });
    }

    const normalizedStatus = normalizeWiPayCallbackStatus(payload.status);
    if (!normalizedStatus) {
      console.warn("Rejected WiPay callback with unsupported status", {
        orderId,
        providerStatus: payload.status || null,
      });

      return redirectToTraveller(request, {
        inquiryId: existingPayment.inquiry_id,
        orderId,
        payment: "failed",
        error: "WiPay returned an unsupported payment status.",
      });
    }

    const amount = parseWiPayAmount(payload.total);
    const expectedAmount = parseWiPayAmount(existingPayment.amount);
    const storedTransactionId = existingPayment.transaction_id?.trim() || null;
    const transactionIdConflicts =
      Boolean(storedTransactionId) &&
      payload.transaction_id !== storedTransactionId;
    // WiPay can return a fee-inclusive total in the callback, while the stored
    // inquiry/payment amount represents the quoted base amount.
    const amountMatches =
      amount !== null &&
      expectedAmount !== null &&
      Number.parseFloat(amount) >= Number.parseFloat(expectedAmount);
    const currencyMatches =
      !payload.currency ||
      payload.currency.toUpperCase() === existingPayment.currency.toUpperCase();

    if (!payload.transaction_id || transactionIdConflicts) {
      console.warn("Rejected WiPay response with mismatched transaction id", {
        orderId,
        status: normalizedStatus,
        transactionIdPresent: Boolean(payload.transaction_id),
      });

      return redirectToTraveller(request, {
        inquiryId: existingPayment.inquiry_id,
        orderId,
        payment: "failed",
        error: "WiPay payment verification failed.",
      });
    }

    const successfulHashIsValid =
      normalizedStatus === "paid" &&
      expectedAmount !== null &&
      verifyWiPayCallbackHash(payload, expectedAmount);

    if (
      normalizedStatus === "paid" &&
      (!storedTransactionId ||
        payload.transaction_id !== storedTransactionId ||
        !amountMatches ||
        !currencyMatches ||
        !successfulHashIsValid)
    ) {
      console.warn("Rejected unverified WiPay paid callback", {
        orderId,
        storedTransactionIdPresent: Boolean(storedTransactionId),
        amountMatches,
        currencyMatches,
        hashPresent: Boolean(payload.hash),
      });

      return redirectToTraveller(request, {
        inquiryId: existingPayment.inquiry_id,
        orderId,
        payment: "failed",
        error: "WiPay payment verification failed.",
      });
    }

    // WiPay signs successful hosted returns, but its browser failure/cancel
    // outcomes are not cryptographically authenticated. Limit those state
    // changes to the active traveler who owns the underlying inquiry.
    if (
      normalizedStatus !== "paid" &&
      !(await canApplyUnsignedBrowserOutcome(existingPayment.inquiry_id))
    ) {
      console.warn("Ignored unsigned WiPay browser outcome without booking ownership", {
        orderId,
        status: normalizedStatus,
      });

      return redirectToTraveller(request, {
        inquiryId: existingPayment.inquiry_id,
        orderId,
        payment: "pending",
        error: "Sign in to your traveler account to confirm this WiPay outcome.",
      });
    }

    const transition = await transitionWiPayPaymentByOrderId({
      orderId,
      status: normalizedStatus,
      // An unsigned browser failure may report a transaction, but it must
      // never bind a new provider transaction to an order. The signed webhook
      // remains the authority when checkout did not return an identifier.
      transactionId: storedTransactionId ? payload.transaction_id : null,
      responsePayload: {
        ...payload,
        settlement: calculatePaymentSettlement(existingPayment.amount),
        original_total: expectedAmount,
        total: payload.total ?? existingPayment.amount,
      },
      knownPayment: existingPayment,
    });

    if (transition.paidClaimed) {
      const inquiryContext = await loadPaymentContext(transition.payment.inquiry_id);
      const paidAt = transition.payment.paid_at ?? new Date().toISOString();
      try {
        const travelerName = inquiryContext?.traveler_name ?? "Traveler";
        const travelerBody = `Payment for ${travelerName}'s booking has been confirmed.`;
        if (inquiryContext?.user_id) {
          await recordPlatformNotification({
            recipientProfileId: inquiryContext.user_id,
            kind: "payment_confirmed",
            title: "Payment confirmed",
            body: travelerBody,
            href: `/TravellerProfile?inquiryId=${transition.payment.inquiry_id}&payment=paid`,
            entityType: "payment",
            entityId: transition.payment.id,
            metadata: {
              orderId,
              inquiryId: transition.payment.inquiry_id,
              status: "paid",
            },
          });
        }

        const operatorId = inquiryContext?.operator_id ?? null;

        if (operatorId) {
          await recordPlatformNotification({
            recipientProfileId: operatorId,
            kind: "traveler_payment_completed",
            title: "Traveler payment completed",
            body: `A traveler payment has been completed for ${inquiryContext?.destination_country ?? inquiryContext?.destination ?? "your booking"}.`,
            href: `/OperatorDashboard?paymentStatus=paid`,
            entityType: "payment",
            entityId: transition.payment.id,
            metadata: {
              orderId,
              inquiryId: transition.payment.inquiry_id,
              status: "paid",
            },
          });
        }
      } catch (error) {
        console.error("WiPay callback paid notification warning", {
          inquiryId: transition.payment.inquiry_id,
          orderId,
          error: error instanceof Error ? error.message : "Paid notifications were not recorded.",
        });
      }

      const emailResult = await sendPaidBookingEmailsForInquiry({
        inquiryId: transition.payment.inquiry_id,
        orderId,
        amount: transition.payment.amount,
        paidAt,
      }).catch((error) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "Unable to send paid booking emails.",
      }));

      if (!emailResult.ok) {
        console.error("WiPay callback paid email warning", {
          inquiryId: transition.payment.inquiry_id,
          orderId,
          error: "error" in emailResult ? emailResult.error : "Paid booking emails were not sent.",
        });
      }
    }

    if (transition.transitionApplied) {
      revalidatePath("/TravellerProfile");
      revalidatePath("/OperatorDashboard");
      revalidatePath("/AdminDashboard");
      revalidatePath("/AdminBookings");
      revalidatePath("/ConfirmationPage");
    }

    const browserStatus =
      transition.currentStatus === "paid"
        ? "paid"
        : transition.currentStatus === "refunded"
          ? "refunded"
          : transition.currentStatus === "cancelled"
            ? "cancelled"
            : transition.currentStatus === "failed"
              ? "failed"
              : "pending";

    return redirectToTraveller(request, {
      inquiryId: transition.payment.inquiry_id,
      orderId,
      payment: browserStatus,
      ...(browserStatus === "failed"
        ? { error: payload.message ?? "WiPay payment failed." }
        : browserStatus === "pending"
          ? { error: payload.message ?? "WiPay payment is still pending." }
          : {}),
    });
  } catch (error) {
    console.error("WiPay callback error", error);
    return redirectToTraveller(request, {
      payment: "failed",
      error: "Unable to process the WiPay payment response.",
    });
  }
}

export async function POST(request: NextRequest) {
  return handleProviderResponse(request);
}
