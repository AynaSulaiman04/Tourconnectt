import "server-only";

import { createSupabaseServiceRoleClient } from "./server";
import { recordAdminNotifications, recordPlatformNotification } from "./notifications";
import type { TravelerInquiry } from "./inquiry-types";

export type TravelerReviewRecord = {
  id: string;
  traveler_id: string;
  operator_id: string | null;
  listing_id: string | null;
  inquiry_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

const REVIEW_COLUMNS =
  "id,traveler_id,operator_id,listing_id,inquiry_id,rating,comment,created_at,updated_at";

function isMissingRelationOrSchemaError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("Could not find the relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

async function resolveUniqueOperatorProfileByName(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  operatorName: string | null | undefined,
) {
  const name = normalizeText(operatorName);

  if (!name) {
    return null;
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("role", "operator")
    .eq("full_name", name);

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  const operators = (data ?? []).filter(
    (profile): profile is { id: string; email: string | null; full_name: string; role: "operator" } =>
      profile.role === "operator",
  );

  return operators.length === 1 ? operators[0] : null;
}

export async function loadTravelerReviewMap(travelerId: string, inquiryIds: string[]) {
  if (!inquiryIds.length) {
    return new Map<string, TravelerReviewRecord>();
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .eq("traveler_id", travelerId)
    .in("inquiry_id", inquiryIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return new Map<string, TravelerReviewRecord>();
    }

    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as TravelerReviewRecord[]).map((review) => [
      review.inquiry_id ?? review.id,
      review,
    ]),
  );
}

export async function submitTravelerReview(params: {
  travelerId: string;
  travelerEmail: string | null;
  inquiryId: string;
  rating: number;
  comment: string | null;
}) {
  const admin = createSupabaseServiceRoleClient();
  const { data: inquiry, error: inquiryError } = await admin
    .from("inquiries")
    .select(
      "id,user_id,listing_id,traveler_name,traveler_email,operator_id,operator_name,status",
    )
    .eq("id", params.inquiryId)
    .maybeSingle();

  if (inquiryError) {
    if (isMissingRelationOrSchemaError(inquiryError)) {
      throw new Error("Reviews are not available yet.");
    }

    throw new Error(inquiryError.message);
  }

  if (!inquiry) {
    throw new Error("We could not find that inquiry.");
  }

  const isOwner =
    inquiry.user_id === params.travelerId ||
    (!inquiry.user_id &&
      normalizeText(inquiry.traveler_email)?.toLowerCase() === normalizeText(params.travelerEmail)?.toLowerCase());

  if (!isOwner) {
    throw new Error("You can only review your own inquiry.");
  }

  if (!["confirmed", "closed"].includes(inquiry.status)) {
    throw new Error("Reviews are available after the inquiry is confirmed.");
  }

  let listingOperatorId = inquiry.operator_id ?? null;

  if (inquiry.listing_id) {
    const { data: listing, error: listingError } = await admin
      .from("tour_listings")
      .select("id,operator_id,operator_name")
      .eq("id", inquiry.listing_id)
      .maybeSingle();

    if (listingError) {
      if (isMissingRelationOrSchemaError(listingError)) {
        throw new Error("Reviews are not available yet.");
      }

      throw new Error(listingError.message);
    }

    if (listing?.operator_id) {
      listingOperatorId = listing.operator_id;
    } else if (!listingOperatorId) {
      const operator = await resolveUniqueOperatorProfileByName(admin, listing?.operator_name ?? inquiry.operator_name);
      listingOperatorId = operator?.id ?? null;
    }
  }

  const { data, error } = await admin
    .from("reviews")
    .upsert(
      {
        traveler_id: params.travelerId,
        operator_id: listingOperatorId,
        listing_id: inquiry.listing_id,
        inquiry_id: inquiry.id,
        rating: params.rating,
        comment: params.comment,
      },
      { onConflict: "inquiry_id" },
    )
    .select(REVIEW_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      throw new Error("Reviews are not available yet.");
    }

    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Unable to save your review.");
  }

  if (listingOperatorId) {
    try {
      await recordPlatformNotification({
        recipientProfileId: listingOperatorId,
        actorProfileId: params.travelerId,
        kind: "review_submitted",
        title: "New traveler review",
        body: `A traveler left a review for inquiry ${inquiry.id}.`,
        href: `/OperatorMessages?inquiry=${inquiry.id}`,
        entityType: "review",
        entityId: data.id,
        metadata: {
          inquiryId: inquiry.id,
          listingId: inquiry.listing_id,
          rating: params.rating,
        },
      });
    } catch (notificationError) {
      console.error("Unable to record review notification", {
        inquiryId: inquiry.id,
        operatorId: listingOperatorId,
        error: notificationError,
      });
    }

    await recordAdminNotifications({
      actorProfileId: params.travelerId,
      kind: "review_submitted",
      title: "New traveler review",
      body: `A traveler left a review for inquiry ${inquiry.id}.`,
      href: `/AdminBookings?inquiry=${inquiry.id}`,
      entityType: "review",
      entityId: data.id,
      metadata: {
        inquiryId: inquiry.id,
        listingId: inquiry.listing_id,
        rating: params.rating,
      },
    }).catch((notificationError) => {
      console.error("Unable to record admin review notification", {
        inquiryId: inquiry.id,
        error: notificationError,
      });
    });
  }

  return data as TravelerReviewRecord;
}

export function canLeaveReview(status: TravelerInquiry["status"] | string, hasReview: boolean) {
  return !hasReview && (status === "confirmed" || status === "closed");
}
