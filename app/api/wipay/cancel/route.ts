import { NextRequest, NextResponse } from "next/server";
import {
  getWiPayPaymentByOrderId,
  isSuccessfulWiPayPayment,
} from "@/lib/payments/wipay";
import { getInquiryConfirmation } from "@/lib/supabase/inquiry";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildConfirmationUrl(request: NextRequest, inquiryId: string, orderId: string, payment: string) {
  const url = new URL("/ConfirmationPage", request.url);
  url.searchParams.set("inquiryId", inquiryId);
  url.searchParams.set("order_id", orderId);
  url.searchParams.set("payment", payment);
  return url;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const requestedInquiryId = url.searchParams.get("inquiryId")?.trim() ?? "";
    const orderId = url.searchParams.get("order_id")?.trim() ?? "";

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing order_id" }, { status: 400 });
    }

    const profileContext = await getOptionalCurrentUserProfile();
    if (!profileContext?.profile) {
      const loginUrl = new URL("/LoginPage", request.url);
      loginUrl.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }

    if (profileContext.profile.role !== "traveler") {
      return NextResponse.redirect(
        new URL(getRoleDashboardRoute(profileContext.profile.role), request.url),
      );
    }

    const payment = await getWiPayPaymentByOrderId(orderId);
    if (!payment) {
      return NextResponse.json({ ok: false, error: "Unknown order_id" }, { status: 404 });
    }

    if (requestedInquiryId && requestedInquiryId !== payment.inquiry_id) {
      return NextResponse.json({ ok: false, error: "Order and inquiry do not match." }, { status: 400 });
    }

    const inquiry = await getInquiryConfirmation(payment.inquiry_id, profileContext.profile);
    if (!inquiry) {
      return NextResponse.json({ ok: false, error: "You do not have access to this order." }, { status: 403 });
    }

    if (isSuccessfulWiPayPayment(payment.status)) {
      return NextResponse.redirect(
        buildConfirmationUrl(request, payment.inquiry_id, orderId, "paid"),
      );
    }

    if (payment.status === "refunded" || payment.status === "cancelled" || payment.status === "failed" || payment.status === "error") {
      return NextResponse.redirect(
        buildConfirmationUrl(request, payment.inquiry_id, orderId, payment.status),
      );
    }

    // A browser cancellation return is not a trusted provider event. Show the
    // cancellation outcome without changing the persisted payment; a signed
    // callback or webhook remains the sole authority for order state.
    return NextResponse.redirect(
      buildConfirmationUrl(request, payment.inquiry_id, orderId, "cancelled"),
    );
  } catch (error) {
    console.error("WiPay cancel error", error);
    return NextResponse.json({ ok: false, error: "Unable to process WiPay cancellation." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}
