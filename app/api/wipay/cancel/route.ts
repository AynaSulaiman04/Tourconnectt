import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateWiPayPaymentByOrderId } from "@/lib/payments/wipay";

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
    const inquiryId = url.searchParams.get("inquiryId")?.trim() ?? "";
    const orderId = url.searchParams.get("order_id")?.trim() ?? "";

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing order_id" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await updateWiPayPaymentByOrderId(orderId, {
      status: "cancelled",
      cancelled_at: now,
      paid_at: null,
      failed_at: null,
    });

    revalidatePath("/ConfirmationPage");
    revalidatePath("/TravellerProfile");
    revalidatePath("/OperatorDashboard");
    revalidatePath("/AdminBookings");
    revalidatePath("/AdminDashboard");

    if (inquiryId) {
      return NextResponse.redirect(buildConfirmationUrl(request, inquiryId, orderId, "cancelled"));
    }

    return NextResponse.json({ ok: true, cancelled: true });
  } catch (error) {
    console.error("WiPay cancel error", error);
    return NextResponse.json({ ok: false, error: "Unable to process WiPay cancellation." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
