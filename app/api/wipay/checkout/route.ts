import { NextRequest, NextResponse } from "next/server";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { getInquiryConfirmation } from "@/lib/supabase/inquiry";
import {
  buildWiPayCheckoutUrls,
  createWiPayCheckoutSession,
  createWiPayPaymentAttempt,
  generateWiPayOrderId,
  getWiPayConfigStatus,
  parseWiPayAmount,
  updateWiPayPaymentByOrderId,
} from "@/lib/payments/wipay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithError(request: NextRequest, inquiryId: string | null, message: string) {
  const target = new URL("/ConfirmationPage", request.url);
  if (inquiryId) {
    target.searchParams.set("inquiryId", inquiryId);
  }
  target.searchParams.set("payment_error", message);
  return NextResponse.redirect(target);
}

async function readInquiryId(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { inquiry_id?: unknown; inquiryId?: unknown } | null;
    const inquiryId = typeof body?.inquiry_id === "string" ? body.inquiry_id : typeof body?.inquiryId === "string" ? body.inquiryId : "";
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

  if (inquiry.status !== "confirmed") {
    return redirectWithError(request, inquiryId, "WiPay checkout is available after the booking is confirmed.");
  }

  const amount = parseWiPayAmount(inquiry.listing?.price ?? null);
  if (!amount) {
    return redirectWithError(request, inquiryId, "This booking does not have a valid payment amount yet.");
  }

  const orderId = generateWiPayOrderId(inquiry.id);
  const returnUrl = buildWiPayCheckoutUrls({
    inquiryId: inquiry.id,
    orderId,
    outcome: "success",
  }).returnUrl;
  const cancelUrl = buildWiPayCheckoutUrls({
    inquiryId: inquiry.id,
    orderId,
    outcome: "cancelled",
  }).cancelUrl;
  const webhookUrl = `${new URL(request.url).origin}/api/wipay/webhook`;

  try {
    await createWiPayPaymentAttempt({
      inquiryId: inquiry.id,
      orderId,
      amount,
      currency: configStatus.currency,
      countryCode: configStatus.countryCode,
    });

    const checkout = await createWiPayCheckoutSession({
      inquiryId: inquiry.id,
      orderId,
      amount,
      currency: configStatus.currency,
      countryCode: configStatus.countryCode,
      returnUrl,
      cancelUrl,
      webhookUrl,
    });

    await updateWiPayPaymentByOrderId(orderId, {
      checkout_url: checkout.checkoutUrl,
      response_payload: checkout.responsePayload,
    });

    const response = NextResponse.redirect(checkout.checkoutUrl, 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    await updateWiPayPaymentByOrderId(orderId, {
      status: "error",
      failed_at: new Date().toISOString(),
      response_payload:
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

    return redirectWithError(
      request,
      inquiry.id,
      "Unable to start WiPay checkout right now. Please try again.",
    );
  }
}
