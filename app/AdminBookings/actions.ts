"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAdminProfile } from "@/lib/supabase/admin";
import { recordPlatformEvent } from "@/lib/supabase/analytics";
import { sendBookingConfirmationEmailForInquiryId } from "@/lib/email/workflows";
import { recordAdminNotifications, recordPlatformNotification } from "@/lib/supabase/notifications";
import {
  checkGoogleCalendarConflictsForBooking,
  syncBookingToGoogleCalendar,
} from "@/lib/calendar/google";
import {
  transitionWiPayPaymentByOrderId,
  type WiPayCanonicalPaymentStatus,
} from "@/lib/payments/wipay";

function getReturnTo(formData: FormData) {
  const value = String(formData.get("return_to") ?? "").trim();
  return value || "/AdminBookings";
}

function buildRedirectUrl(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, "http://tt-connect.local");

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return `${url.pathname}${url.search}`;
}

function normalizePaymentStatus(value: string): WiPayCanonicalPaymentStatus | null {
  if (value === "cancelled" || value === "refunded") {
    return value;
  }

  return null;
}

async function getInquiryCalendarEventId(inquiryId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("inquiries")
    .select("id,google_calendar_event_id")
    .eq("id", inquiryId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return typeof data?.google_calendar_event_id === "string" && data.google_calendar_event_id.trim().length > 0
    ? data.google_calendar_event_id
    : null;
}

async function getInquiryNotificationContext(inquiryId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("inquiries")
    .select("id,user_id,operator_id,operator_name,traveler_name,destination,destination_country,listing_id,status")
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
    status: string | null;
  };
}

export async function updateInquiryStatusAction(formData: FormData) {
  const profile = await requireAdminProfile();

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const returnTo = getReturnTo(formData);

  if (!inquiryId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-inquiry" }));
  }

  if (!["submitted", "reviewed", "confirmed", "closed"].includes(status)) {
    redirect(buildRedirectUrl(returnTo, { error: "invalid-status" }));
  }

  const admin = createSupabaseServiceRoleClient();

  const existingGoogleCalendarEventId = status === "confirmed" ? await getInquiryCalendarEventId(inquiryId) : null;

  if (status === "confirmed" && !existingGoogleCalendarEventId) {
    const conflictResult = await checkGoogleCalendarConflictsForBooking(inquiryId);

    if ("conflict" in conflictResult && conflictResult.conflict) {
      const conflictMessage =
        conflictResult.source === "supabase"
          ? "This time window overlaps another confirmed Supabase booking."
          : "This time window conflicts with Google Calendar.";
      redirect(buildRedirectUrl(returnTo, { error: conflictMessage }));
    }
  }

  const { error } = await admin
    .from("inquiries")
    .update({ status })
    .eq("id", inquiryId);

  if (error) {
    console.error("Unable to update booking status", { inquiryId, status, error: error.message });
    redirect(buildRedirectUrl(returnTo, { error: "We could not update this booking. Please try again." }));
  }

  if (status === "confirmed") {
    const emailResult = await sendBookingConfirmationEmailForInquiryId(inquiryId);
    if (!emailResult.ok) {
      console.error("Booking confirmation email warning", {
        inquiryId,
        error: "error" in emailResult ? emailResult.error : "Email send skipped or failed.",
      });
    }
  }

  if (status === "confirmed" || status === "closed") {
    const calendarResult = await syncBookingToGoogleCalendar(inquiryId);
    if (!calendarResult.ok && !calendarResult.skipped) {
      console.error("Google Calendar sync warning", {
        inquiryId,
        status,
        error: calendarResult.error ?? "Unable to synchronize booking with Google Calendar.",
      });
    }
    if ("conflict" in calendarResult && calendarResult.conflict) {
      redirect(buildRedirectUrl(returnTo, { error: calendarResult.error ?? "calendar-conflict" }));
    }
  }

  await recordPlatformEvent({
    event_type:
      status === "reviewed"
        ? "inquiry_reviewed"
        : status === "confirmed"
          ? "inquiry_confirmed"
          : "inquiry_closed",
    actor_profile_id: profile.id,
    actor_role: "admin",
    inquiry_id: inquiryId,
    metadata: { status },
  });

  const notificationContext = await getInquiryNotificationContext(inquiryId);
  const resolvedOperatorId = notificationContext?.operator_id ?? null;
  const inquiryLabel =
    notificationContext?.destination_country ??
    notificationContext?.destination ??
    notificationContext?.operator_name ??
    "your booking";

  await recordAdminNotifications({
    actorProfileId: profile.id,
    excludeProfileId: profile.id,
    kind: `inquiry_${status}`,
    title:
      status === "reviewed"
        ? "Enquiry reviewed"
        : status === "confirmed"
          ? "Enquiry confirmed"
          : "Enquiry closed",
    body:
      status === "reviewed"
        ? `An enquiry for ${inquiryLabel} was moved to review.`
        : status === "confirmed"
          ? `An enquiry for ${inquiryLabel} was confirmed.`
          : `An enquiry for ${inquiryLabel} was closed.`,
    href: `/AdminBookings?inquiry=${inquiryId}`,
    entityType: "inquiry",
    entityId: inquiryId,
    metadata: { status },
  }).catch((notificationError) => {
    console.error("Unable to record admin booking notification", {
      inquiryId,
      status,
      error: notificationError,
    });
  });

  if (notificationContext) {
    try {
      if (notificationContext.user_id) {
        await recordPlatformNotification({
          recipientProfileId: notificationContext.user_id,
          actorProfileId: profile.id,
          kind: `inquiry_${status}`,
          title:
            status === "reviewed"
              ? "Enquiry under review"
              : status === "confirmed"
                ? "Enquiry confirmed"
                : "Enquiry closed",
          body:
            status === "reviewed"
              ? `Your enquiry for ${inquiryLabel} is under review.`
              : status === "confirmed"
                ? `Your enquiry for ${inquiryLabel} is confirmed.`
                : `Your enquiry for ${inquiryLabel} is now closed.`,
          href: `/ConfirmationPage?inquiryId=${inquiryId}`,
          entityType: "inquiry",
          entityId: inquiryId,
          metadata: { status },
        });
      }

      if (resolvedOperatorId) {
        await recordPlatformNotification({
          recipientProfileId: resolvedOperatorId,
          actorProfileId: profile.id,
          kind: `inquiry_${status}`,
          title:
            status === "reviewed"
              ? "Enquiry under review"
              : status === "confirmed"
                ? "Enquiry confirmed"
                : "Enquiry closed",
          body:
            status === "reviewed"
              ? `The enquiry for ${inquiryLabel} is now under review.`
              : status === "confirmed"
                ? `The enquiry for ${inquiryLabel} has been confirmed.`
                : `The enquiry for ${inquiryLabel} has been closed.`,
          href: `/OperatorMessages?inquiry=${inquiryId}`,
          entityType: "inquiry",
          entityId: inquiryId,
          metadata: { status },
        });
      }
    } catch (notificationError) {
      console.error("Unable to record inquiry status notification", {
        inquiryId,
        status,
        error: notificationError,
      });
    }
  }

  revalidatePath("/AdminDashboard");
  revalidatePath("/AdminBookings");
  revalidatePath("/OperatorDashboard");
  revalidatePath("/OperatorBookings");
  revalidatePath("/OperatorMessages");
  revalidatePath("/ConfirmationPage");
  revalidatePath("/TravellerProfile");
  revalidatePath("/AdminAnalytics");
  redirect(buildRedirectUrl(returnTo, { updated: "1" }));
}

export async function updateInquiryPaymentAmountAction(formData: FormData) {
  await requireAdminProfile();

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const returnTo = getReturnTo(formData);
  const rawAmount = String(formData.get("payment_amount") ?? "").trim();

  if (!inquiryId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-inquiry" }));
  }

  const amount = rawAmount ? Number.parseFloat(rawAmount.replace(/[^0-9.]/g, "")) : NaN;
  if (rawAmount && (!Number.isFinite(amount) || amount <= 0)) {
    redirect(buildRedirectUrl(returnTo, { error: "invalid-payment-amount" }));
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("inquiries")
    .update({
      payment_amount: rawAmount ? amount.toFixed(2) : null,
    })
    .eq("id", inquiryId);

  if (error) {
    console.error("Unable to update inquiry payment amount", { inquiryId, error: error.message });
    redirect(buildRedirectUrl(returnTo, { error: "We could not update this payment amount. Please try again." }));
  }

  revalidatePath("/AdminDashboard");
  revalidatePath("/AdminBookings");
  revalidatePath("/OperatorDashboard");
  revalidatePath("/OperatorBookings");
  revalidatePath("/ConfirmationPage");
  revalidatePath("/TravellerProfile");
  revalidatePath("/AdminAnalytics");
  redirect(buildRedirectUrl(returnTo, { updated: "1" }));
}

export async function updateWiPayPaymentStatusAction(formData: FormData) {
  await requireAdminProfile();

  const orderId = String(formData.get("order_id") ?? "").trim();
  const status = normalizePaymentStatus(String(formData.get("status") ?? "").trim());
  const returnTo = getReturnTo(formData);

  if (!orderId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-payment" }));
  }

  if (!status) {
    redirect(buildRedirectUrl(returnTo, { error: "invalid-payment-status" }));
  }

  let transition: Awaited<ReturnType<typeof transitionWiPayPaymentByOrderId>>;
  try {
    transition = await transitionWiPayPaymentByOrderId({
      orderId,
      status,
    });
  } catch (error) {
    console.error("Unable to update WiPay payment", { orderId, status, error });
    redirect(buildRedirectUrl(returnTo, { error: "We could not update this payment. Please try again." }));
  }

  if (transition.currentStatus !== status) {
    redirect(
      buildRedirectUrl(returnTo, {
        error: `This payment cannot move from ${transition.previousStatus} to ${status}.`,
      }),
    );
  }

  revalidatePath("/AdminDashboard");
  revalidatePath("/AdminBookings");
  revalidatePath("/OperatorDashboard");
  revalidatePath("/ConfirmationPage");
  revalidatePath("/TravellerProfile");
  redirect(buildRedirectUrl(returnTo, { updated: "1" }));
}

