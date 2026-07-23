import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  sendBookingReminderEmail,
  sendPostTourReviewRequestEmail,
  sendPreTourInstructionsEmail,
} from "./mailer";

type InquiryRow = {
  id: string;
  user_id: string | null;
  listing_id: string | null;
  traveler_name: string;
  traveler_email: string;
  traveler_phone: string | null;
  destination: string;
  destination_country: string;
  operator_name: string;
  operator_id: string | null;
  preferred_start_date: string | null;
  preferred_end_date: string | null;
  availability: "morning" | "afternoon" | "evening" | "flexible";
  notes: string | null;
  status: "submitted" | "reviewed" | "confirmed" | "closed";
  reminder_email_sent_at?: string | null;
  pre_tour_email_sent_at?: string | null;
  review_request_email_sent_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ListingRow = {
  id: string;
  title: string;
  location: string;
  operator_name: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export type ScheduledEmailSummary = {
  ok: boolean;
  remindersSent: number;
  preTourSent: number;
  reviewRequestsSent: number;
  skipped: number;
  errors: string[];
};

type DueEmailTask = {
  inquiry: InquiryRow;
  listing: ListingRow | null;
  operatorEmail: string | null;
  reminderDue: boolean;
  preTourDue: boolean;
  reviewDue: boolean;
};

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.message?.includes("column does not exist") ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the column")),
  );
}

function isMissingRelationError(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "42P01" || error?.message?.includes("Could not find the table") || error?.message?.includes("relation");
}

function getUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftUtcDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return getUtcDateKey(date);
}

function parseDateKey(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.slice(0, 10);
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : getUtcDateKey(date);
}

function buildTripDate(inquiry: InquiryRow) {
  return inquiry.preferred_start_date ?? inquiry.preferred_end_date ?? null;
}

async function fetchConfirmedInquiries(admin: ReturnType<typeof createSupabaseServiceRoleClient>) {
  const selectWithTracking =
    "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,reminder_email_sent_at,pre_tour_email_sent_at,review_request_email_sent_at,created_at,updated_at";
  const selectBase =
    "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at";

  const withTracking = await admin
    .from("inquiries")
    .select(selectWithTracking)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });

  if (withTracking.error) {
    if (isMissingColumnError(withTracking.error) || isMissingRelationError(withTracking.error)) {
      const fallback = await admin
        .from("inquiries")
        .select(selectBase)
        .eq("status", "confirmed")
        .order("created_at", { ascending: true });

      if (fallback.error) {
        if (isMissingColumnError(fallback.error) || isMissingRelationError(fallback.error)) {
          return {
            rows: [],
            hasTrackingColumns: false,
          };
        }

        throw new Error(fallback.error.message);
      }

      return {
        rows: ((fallback.data ?? []) as InquiryRow[]).map((row) => ({
          ...row,
          reminder_email_sent_at: null,
          pre_tour_email_sent_at: null,
          review_request_email_sent_at: null,
        })),
        hasTrackingColumns: false,
      };
    }

    throw new Error(withTracking.error.message);
  }

  return {
    rows: (withTracking.data ?? []) as InquiryRow[],
    hasTrackingColumns: true,
  };
}

async function loadListingAndOperatorMaps(admin: ReturnType<typeof createSupabaseServiceRoleClient>, inquiries: InquiryRow[]) {
  const listingIds = [...new Set(inquiries.map((item) => item.listing_id).filter((value): value is string => Boolean(value)))];
  const operatorIds = [...new Set(inquiries.map((item) => item.operator_id).filter((value): value is string => Boolean(value)))];

  const [listingsResult, profilesResult] = await Promise.all([
    listingIds.length
      ? admin
          .from("tour_listings")
          .select("id,title,location,operator_name")
          .in("id", listingIds)
      : Promise.resolve({ data: [], error: null }),
    operatorIds.length
      ? admin
          .from("profiles")
          .select("id,email,full_name")
          .in("id", operatorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (listingsResult.error && !isMissingColumnError(listingsResult.error) && !isMissingRelationError(listingsResult.error)) {
    throw new Error(listingsResult.error.message);
  }

  if (profilesResult.error && !isMissingColumnError(profilesResult.error) && !isMissingRelationError(profilesResult.error)) {
    throw new Error(profilesResult.error.message);
  }

  const listingsById = new Map<string, ListingRow>(
    ((listingsResult.data ?? []) as ListingRow[]).map((listing) => [listing.id, listing]),
  );
  const operatorEmailById = new Map<string, string | null>(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile.email]),
  );

  return { listingsById, operatorEmailById };
}

async function updateSentTimestamp(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  inquiryId: string,
  column: "reminder_email_sent_at" | "pre_tour_email_sent_at" | "review_request_email_sent_at",
) {
  const { error } = await admin.from("inquiries").update({ [column]: new Date().toISOString() }).eq("id", inquiryId);

  if (error) {
    if (isMissingColumnError(error)) {
      return;
    }

    throw new Error(error.message);
  }
}

async function maybeSendEmail<T extends { ok: boolean; error?: string }>(task: () => Promise<T>) {
  try {
    return await task();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to send scheduled email.",
    } as T;
  }
}

export async function processScheduledEmails(): Promise<ScheduledEmailSummary> {
  const admin = createSupabaseServiceRoleClient();
  const summary: ScheduledEmailSummary = {
    ok: true,
    remindersSent: 0,
    preTourSent: 0,
    reviewRequestsSent: 0,
    skipped: 0,
    errors: [],
  };

  const { rows: inquiries } = await fetchConfirmedInquiries(admin);

  if (!inquiries.length) {
    return summary;
  }

  const { listingsById, operatorEmailById } = await loadListingAndOperatorMaps(admin, inquiries);
  const todayKey = getUtcDateKey(new Date());

  const tasks: DueEmailTask[] = inquiries
    .map((inquiry) => {
      const tripDate = buildTripDate(inquiry);
      const tripDateKey = parseDateKey(tripDate);
      const reminderDue = Boolean(tripDateKey && todayKey === shiftUtcDateKey(tripDateKey, -1));
      const preTourDue = Boolean(tripDateKey && todayKey === shiftUtcDateKey(tripDateKey, -2));
      const reviewBaseKey = parseDateKey(inquiry.preferred_end_date ?? tripDate);
      const reviewDue = Boolean(reviewBaseKey && todayKey === shiftUtcDateKey(reviewBaseKey, 1));

      const listing = inquiry.listing_id ? listingsById.get(inquiry.listing_id) ?? null : null;
      const operatorEmail = inquiry.operator_id ? operatorEmailById.get(inquiry.operator_id) ?? null : null;

      return {
        inquiry,
        listing,
        operatorEmail,
        reminderDue,
        preTourDue,
        reviewDue,
      };
    })
    .filter((task) => task.reminderDue || task.preTourDue || task.reviewDue);

  if (!tasks.length) {
    summary.skipped = inquiries.length;
    return summary;
  }

  for (const task of tasks) {
    const listingTitle = task.listing?.title ?? task.inquiry.destination;
    const meetingPoint = task.listing?.location ?? task.inquiry.destination;
    const operatorContact = task.operatorEmail ?? task.inquiry.operator_name;
    const baseTripDate = task.inquiry.preferred_start_date ?? task.inquiry.preferred_end_date ?? null;

    if (task.reminderDue) {
      if (task.inquiry.reminder_email_sent_at) {
        summary.skipped += 1;
      } else if (!task.inquiry.traveler_email) {
        summary.skipped += 1;
      } else {
        const result = await maybeSendEmail(() =>
          sendBookingReminderEmail({
            to: task.inquiry.traveler_email,
            inquiryId: task.inquiry.id,
            travelerName: task.inquiry.traveler_name,
            listingTitle,
            operatorName: task.listing?.operator_name ?? task.inquiry.operator_name,
            preferredStartDate: task.inquiry.preferred_start_date,
            preferredEndDate: task.inquiry.preferred_end_date,
            tripDateTime: baseTripDate,
            operatorContact,
          }),
        );

        if (result.ok) {
          summary.remindersSent += 1;
          await updateSentTimestamp(admin, task.inquiry.id, "reminder_email_sent_at");
        } else {
          summary.errors.push(`Reminder email failed for ${task.inquiry.id}: ${result.error ?? "unknown error"}`);
          summary.skipped += 1;
        }
      }
    }

    if (task.preTourDue) {
      if (task.inquiry.pre_tour_email_sent_at) {
        summary.skipped += 1;
      } else if (!task.inquiry.traveler_email) {
        summary.skipped += 1;
      } else {
        const result = await maybeSendEmail(() =>
          sendPreTourInstructionsEmail({
            to: task.inquiry.traveler_email,
            inquiryId: task.inquiry.id,
            travelerName: task.inquiry.traveler_name,
            listingTitle,
            operatorName: task.listing?.operator_name ?? task.inquiry.operator_name,
            preferredStartDate: task.inquiry.preferred_start_date,
            preferredEndDate: task.inquiry.preferred_end_date,
            tripDateTime: baseTripDate,
            meetingPoint,
            instructions: task.listing?.title ? null : task.inquiry.notes,
          }),
        );

        if (result.ok) {
          summary.preTourSent += 1;
          await updateSentTimestamp(admin, task.inquiry.id, "pre_tour_email_sent_at");
        } else {
          summary.errors.push(`Pre-tour email failed for ${task.inquiry.id}: ${result.error ?? "unknown error"}`);
          summary.skipped += 1;
        }
      }
    }

    if (task.reviewDue) {
      if (task.inquiry.review_request_email_sent_at) {
        summary.skipped += 1;
      } else if (!task.inquiry.traveler_email) {
        summary.skipped += 1;
      } else {
        const result = await maybeSendEmail(() =>
          sendPostTourReviewRequestEmail({
            to: task.inquiry.traveler_email,
            inquiryId: task.inquiry.id,
            travelerName: task.inquiry.traveler_name,
            listingTitle,
            operatorName: task.listing?.operator_name ?? task.inquiry.operator_name,
            preferredStartDate: task.inquiry.preferred_start_date,
            preferredEndDate: task.inquiry.preferred_end_date,
          }),
        );

        if (result.ok) {
          summary.reviewRequestsSent += 1;
          await updateSentTimestamp(admin, task.inquiry.id, "review_request_email_sent_at");
        } else {
          summary.errors.push(`Review request email failed for ${task.inquiry.id}: ${result.error ?? "unknown error"}`);
          summary.skipped += 1;
        }
      }
    }
  }

  if (summary.errors.length > 0) {
    summary.ok = false;
  }

  return summary;
}
