import { NextRequest, NextResponse } from "next/server";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { getInquiryConfirmation } from "@/lib/supabase/inquiry";
import {
  buildWiPayResponseUrl,
  createWiPayHostedCheckoutSession,
  createWiPayPaymentAttempt,
  generateWiPayOrderId,
  getWiPayConfigStatus,
  getLatestWiPayPaymentForInquiry,
  isPendingWiPayPayment,
  isSuccessfulWiPayPayment,
  resolveWiPayInquiryAmount,
  transitionWiPayPaymentByOrderId,
} from "@/lib/payments/wipay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function wantsJsonResponse(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  return accept.includes("application/json") || contentType.includes("application/json");
}

function redirectWithError(request: NextRequest, inquiryId: string | null, message: string) {
  const target = new URL("/TravellerProfile", request.url);
  if (inquiryId) {
    target.searchParams.set("inquiryId", inquiryId);
  }
  target.searchParams.set("payment", "failed");
  target.searchParams.set("payment_error", message);
  return NextResponse.redirect(target);
}

async function readInquiryId(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { inquiry_id?: unknown; inquiryId?: unknown } | null;
    const inquiryId =
      typeof body?.inquiry_id === "string" ? body.inquiry_id : typeof body?.inquiryId === "string" ? body.inquiryId : "";
    return inquiryId.trim();
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return "";
  }

  return String(formData.get("inquiry_id") ?? formData.get("inquiryId") ?? "").trim();
}

export async function POST(request: NextRequest) {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile) {
    return NextResponse.redirect(new URL("/LoginPage", request.url));
  }

  if (profileContext.profile.role !== "traveler") {
    return NextResponse.redirect(new URL(getRoleDashboardRoute(profileContext.profile.role), request.url));
  }

  const configStatus = getWiPayConfigStatus();
  if (!configStatus.configured) {
    return redirectWithError(request, null, configStatus.message);
  }

  const inquiryId = await readInquiryId(request);
  if (!inquiryId) {
    return redirectWithError(request, null, "Choose a valid booking before starting WiPay checkout.");
  }

  const inquiry = await getInquiryConfirmation(inquiryId, profileContext.profile);
  if (!inquiry) {
    return redirectWithError(request, inquiryId, "We could not find that booking or you do not have access to it.");
  }

  if (!["confirmed", "approved", "payable"].includes(inquiry.status)) {
    return redirectWithError(request, inquiryId, "WiPay checkout is available after the booking is confirmed.");
  }

  const amount = resolveWiPayInquiryAmount(inquiry);
  if (!amount) {
    return redirectWithError(request, inquiryId, "This booking does not have a payable amount yet. Ask an admin to add a payment amount.");
  }

  const latestPayment = inquiry.payment ?? (await getLatestWiPayPaymentForInquiry(inquiry.id).catch(() => null));
  if (latestPayment && isSuccessfulWiPayPayment(latestPayment.status)) {
    const target = new URL("/TravellerProfile", request.url);
    target.searchParams.set("inquiryId", inquiry.id);
    target.searchParams.set("payment", "paid");
    return NextResponse.redirect(target);
  }

  if (latestPayment && isPendingWiPayPayment(latestPayment.status) && latestPayment.checkout_url) {
    if (wantsJsonResponse(request)) {
      return NextResponse.json({
        ok: true,
        checkoutUrl: latestPayment.checkout_url,
        orderId: latestPayment.order_id,
        status: latestPayment.status,
      });
    }

    return NextResponse.redirect(latestPayment.checkout_url);
  }

  const orderId = generateWiPayOrderId(inquiry.id);
  const responseUrl = buildWiPayResponseUrl({
    inquiryId: inquiry.id,
    orderId,
  });

  try {
    const paymentRecord = await createWiPayPaymentAttempt({
      inquiryId: inquiry.id,
      orderId,
      amount,
      currency: configStatus.currency,
      countryCode: configStatus.countryCode,
    });

    const checkout = await createWiPayHostedCheckoutSession({
      inquiryId: inquiry.id,
      orderId,
      amount,
      currency: configStatus.currency,
      countryCode: configStatus.countryCode,
      responseUrl,
      travelerEmail: inquiry.traveler_email,
    });

    await transitionWiPayPaymentByOrderId({
      orderId,
      status: "initiated",
      transactionId: checkout.transactionId ?? paymentRecord.transaction_id ?? null,
      checkoutUrl: checkout.checkoutUrl,
      responsePayload: checkout.responsePayload,
      knownPayment: paymentRecord,
    });

    if (wantsJsonResponse(request)) {
      return NextResponse.json({
        ok: true,
        checkoutUrl: checkout.checkoutUrl,
        orderId,
        status: "initiated",
      });
    }

    const response = NextResponse.redirect(checkout.checkoutUrl, 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    await transitionWiPayPaymentByOrderId({
      orderId,
      status: "failed",
      responsePayload:
        error instanceof Error
          ? {
              error: error.message,
            }
          : {
              error: "Unable to start WiPay checkout right now.",
            },
    }).catch(() => null);

    console.error("Unable to start WiPay checkout", {
      inquiryId: inquiry.id,
      error: error instanceof Error ? error.message : error,
    });

    return redirectWithError(request, inquiry.id, "Unable to start WiPay checkout right now. Please try again.");
  }
}
