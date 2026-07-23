import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sendPaidBookingEmailsForInquiry } from "@/lib/email/workflows";
import {
  calculatePaymentSettlement,
  getWiPayPaymentByOrderId,
  isSuccessfulWiPayPayment,
  normalizeWiPayCallbackStatus,
  parseWiPayAmount,
  updateWiPayPaymentByOrderId,
  verifyWiPayCallbackHash,
} from "@/lib/payments/wipay";
import { recordPlatformNotification } from "@/lib/supabase/notifications";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveOperatorProfileId } from "@/lib/supabase/operator-resolution";

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

async function readCallbackPayload(request: NextRequest): Promise<CallbackPayload> {
  if (request.method === "GET") {
    const params = request.nextUrl.searchParams;
    return {
      order_id: getString(params.get("order_id")),
      status: getString(params.get("status")),
      transaction_id: getString(params.get("transaction_id")) || null,
      total: getString(params.get("total")) || null,
      currency: getString(params.get("currency")) || null,
      message: getString(params.get("message")) || null,
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
      message: getString(body?.message) || null,
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
    message: getString(formData.get("message")) || null,
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
  return POST(request);
}

export async function POST(request: NextRequest) {
  try {
    const payload = await readCallbackPayload(request);
    const orderId = payload.order_id;

    if (!orderId) {
      return NextResponse.redirect(buildTravellerRedirect(request, { payment: "failed", error: "Missing WiPay order id." }));
    }

    const existingPayment = await getWiPayPaymentByOrderId(orderId);
    if (!existingPayment) {
      return NextResponse.redirect(
        buildTravellerRedirect(request, { payment: "failed", orderId, error: "We could not match that WiPay payment." }),
      );
    }

    const normalizedStatus = normalizeWiPayCallbackStatus(payload.status);
    const amount = parseWiPayAmount(payload.total);
    const expectedAmount = parseWiPayAmount(existingPayment.amount);
    const signatureIsValid =
      normalizedStatus !== "paid" || verifyWiPayCallbackHash(payload, payload.hash) || !payload.hash;
    // WiPay can return a fee-inclusive total in the callback, while the stored
    // inquiry/payment amount represents the quoted base amount.
    const amountMatches = !amount || !expectedAmount || amount >= expectedAmount;

    const now = new Date().toISOString();
    const inquiryContext = await loadPaymentContext(existingPayment.inquiry_id);

    if (normalizedStatus === "paid") {
      if (!signatureIsValid || !amountMatches) {
        await updateWiPayPaymentByOrderId(orderId, {
          status: "failed",
          failed_at: now,
          response_payload: {
            ...(existingPayment.response_payload ?? {}),
            ...payload,
            settlement: calculatePaymentSettlement(payload.total ?? existingPayment.amount),
            verification_failed: true,
          },
          transaction_id: payload.transaction_id ?? existingPayment.transaction_id,
        });

        revalidatePath("/TravellerProfile");
        revalidatePath("/OperatorDashboard");
        revalidatePath("/AdminDashboard");
        revalidatePath("/AdminBookings");
        revalidatePath("/ConfirmationPage");

        return NextResponse.redirect(
          buildTravellerRedirect(request, {
            inquiryId: existingPayment.inquiry_id,
            orderId,
            payment: "failed",
            error: "WiPay payment verification failed.",
          }),
        );
      }

      await updateWiPayPaymentByOrderId(orderId, {
        status: "paid",
        transaction_id: payload.transaction_id ?? existingPayment.transaction_id,
        paid_at: now,
        cancelled_at: null,
        failed_at: null,
        response_payload: {
          ...(existingPayment.response_payload ?? {}),
          ...payload,
          settlement: calculatePaymentSettlement(payload.total ?? existingPayment.amount),
          total: payload.total ?? existingPayment.amount,
        },
      });

      if (!isSuccessfulWiPayPayment(existingPayment.status)) {
        const travelerName = inquiryContext?.traveler_name ?? "Traveler";
        const travelerBody = `Payment for ${travelerName}'s booking has been confirmed.`;
        if (inquiryContext?.user_id) {
          await recordPlatformNotification({
            recipientProfileId: inquiryContext.user_id,
            kind: "payment_confirmed",
            title: "Payment confirmed",
            body: travelerBody,
            href: `/TravellerProfile?inquiryId=${existingPayment.inquiry_id}&payment=paid`,
            entityType: "payment",
            entityId: existingPayment.id,
            metadata: {
              orderId,
              inquiryId: existingPayment.inquiry_id,
              status: "paid",
            },
          });
        }

        const operatorId =
          inquiryContext?.operator_id ??
          (await resolveOperatorProfileId(createSupabaseServiceRoleClient(), [inquiryContext?.operator_name, inquiryContext?.destination]).catch(
            () => null,
          ));

        if (operatorId) {
          await recordPlatformNotification({
            recipientProfileId: operatorId,
            kind: "traveler_payment_completed",
            title: "Traveler payment completed",
            body: `A traveler payment has been completed for ${inquiryContext?.destination_country ?? inquiryContext?.destination ?? "your booking"}.`,
            href: `/OperatorDashboard?paymentStatus=paid`,
            entityType: "payment",
            entityId: existingPayment.id,
            metadata: {
              orderId,
              inquiryId: existingPayment.inquiry_id,
              status: "paid",
            },
          });
        }

        const emailResult = await sendPaidBookingEmailsForInquiry({
          inquiryId: existingPayment.inquiry_id,
          orderId,
          amount: payload.total ?? existingPayment.amount,
          paidAt: now,
        }).catch((error) => ({
          ok: false as const,
          error: error instanceof Error ? error.message : "Unable to send paid booking emails.",
        }));

        if (!emailResult.ok) {
          console.error("WiPay callback paid email warning", {
            inquiryId: existingPayment.inquiry_id,
            orderId,
            error: "error" in emailResult ? emailResult.error : "Paid booking emails were not sent.",
          });
        }
      }

      revalidatePath("/TravellerProfile");
      revalidatePath("/OperatorDashboard");
      revalidatePath("/AdminDashboard");
      revalidatePath("/AdminBookings");
      revalidatePath("/ConfirmationPage");

      return NextResponse.redirect(
        buildTravellerRedirect(request, {
          inquiryId: existingPayment.inquiry_id,
          orderId,
          payment: "paid",
        }),
      );
    }

    if (normalizedStatus === "failed") {
      await updateWiPayPaymentByOrderId(orderId, {
        status: "failed",
        transaction_id: payload.transaction_id ?? existingPayment.transaction_id,
        failed_at: now,
        response_payload: {
          ...(existingPayment.response_payload ?? {}),
          ...payload,
          settlement: calculatePaymentSettlement(payload.total ?? existingPayment.amount),
        },
      });

      revalidatePath("/TravellerProfile");
      revalidatePath("/OperatorDashboard");
      revalidatePath("/AdminDashboard");
      revalidatePath("/AdminBookings");
      revalidatePath("/ConfirmationPage");

      return NextResponse.redirect(
        buildTravellerRedirect(request, {
          inquiryId: existingPayment.inquiry_id,
          orderId,
          payment: "failed",
          error: payload.message ?? "WiPay payment failed.",
        }),
      );
    }

    if (normalizedStatus === "cancelled") {
      await updateWiPayPaymentByOrderId(orderId, {
        status: "cancelled",
        transaction_id: payload.transaction_id ?? existingPayment.transaction_id,
        cancelled_at: now,
        response_payload: {
          ...(existingPayment.response_payload ?? {}),
          ...payload,
          settlement: calculatePaymentSettlement(payload.total ?? existingPayment.amount),
        },
      });

      revalidatePath("/TravellerProfile");
      revalidatePath("/OperatorDashboard");
      revalidatePath("/AdminDashboard");
      revalidatePath("/AdminBookings");
      revalidatePath("/ConfirmationPage");

      return NextResponse.redirect(
        buildTravellerRedirect(request, {
          inquiryId: existingPayment.inquiry_id,
          orderId,
          payment: "cancelled",
        }),
      );
    }

    if (normalizedStatus === "refunded") {
      await updateWiPayPaymentByOrderId(orderId, {
        status: "refunded",
        transaction_id: payload.transaction_id ?? existingPayment.transaction_id,
        refunded_at: now,
        response_payload: {
          ...(existingPayment.response_payload ?? {}),
          ...payload,
          settlement: calculatePaymentSettlement(payload.total ?? existingPayment.amount),
        },
      });

      revalidatePath("/TravellerProfile");
      revalidatePath("/OperatorDashboard");
      revalidatePath("/AdminDashboard");
      revalidatePath("/AdminBookings");
      revalidatePath("/ConfirmationPage");

      return NextResponse.redirect(
        buildTravellerRedirect(request, {
          inquiryId: existingPayment.inquiry_id,
          orderId,
          payment: "refunded",
        }),
      );
    }

    return NextResponse.redirect(
      buildTravellerRedirect(request, {
        inquiryId: existingPayment.inquiry_id,
        orderId,
        payment: "pending",
        error: payload.message ?? "WiPay payment is still pending.",
      }),
    );
  } catch (error) {
    console.error("WiPay callback error", error);
    return NextResponse.redirect(
      buildTravellerRedirect(request, {
        payment: "failed",
        error: "Unable to process the WiPay payment response.",
      }),
    );
  }
}
