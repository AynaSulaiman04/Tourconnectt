import "server-only";

import { normalizeMediaSource } from "./media";
import { createSupabaseServiceRoleClient } from "./server";
import type { InquiryConfirmation, TourListing, TravelerInquiry } from "./inquiry-types";
import { canLeaveReview, loadTravelerReviewMap } from "./reviews";
import { getLatestWiPayPaymentForInquiry, getWiPayPaymentsForInquiryIds } from "@/lib/payments/wipay";

function isMissingRelationError(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "42P01" || error?.message?.includes("Could not find the table");
}

function isFetchFailedError(error: unknown) {
  return error instanceof Error && (error.message === "TypeError: fetch failed" || error.message.includes("fetch failed"));
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePublicListingImage(value: string | null | undefined) {
  const normalized = normalizeMediaSource(value);

  if (!normalized) {
    return null;
  }

  // Large inline data URLs can make the public listing feed unstable and bloat
  // the server component payload. Let the UI render its built-in fallback card.
  if (normalized.startsWith("data:") && normalized.length > 200_000) {
    return null;
  }

  return normalized;
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
    .select("id,email,full_name,role,avatar_base64,profile_image_url")
    .eq("role", "operator")
    .eq("full_name", name);

  if (error) {
    if (isMissingRelationError(error) || error.message?.includes("schema cache")) {
      return null;
    }

    throw new Error(error.message);
  }

  const operators = (data ?? []).filter((entry) => entry.role === "operator");

  if (operators.length !== 1) {
    return null;
  }

  return operators[0] as {
    id: string;
    email: string | null;
    full_name: string;
    role: "operator";
    avatar_base64?: string | null;
    profile_image_url?: string | null;
  };
}

async function loadListingDraftContactByListingId(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  listingId: string,
) {
  const { data, error } = await admin
    .from("operator_listing_drafts")
    .select("published_listing_id,contact_email,contact_phone,updated_at")
    .eq("published_listing_id", listingId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error) || error.message?.includes("schema cache")) {
      return null;
    }

    throw new Error(error.message);
  }

  return data as { published_listing_id: string | null; contact_email: string | null; contact_phone: string | null } | null;
}

async function loadListingDraftContactsByListingIds(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  listingIds: string[],
) {
  if (!listingIds.length) {
    return new Map<string, { contact_email: string | null; contact_phone: string | null }>();
  }

  const { data, error } = await admin
    .from("operator_listing_drafts")
    .select("published_listing_id,contact_email,contact_phone,updated_at")
    .in("published_listing_id", listingIds)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingRelationError(error) || error.message?.includes("schema cache")) {
      return new Map<string, { contact_email: string | null; contact_phone: string | null }>();
    }

    throw new Error(error.message);
  }

  const contacts = new Map<string, { contact_email: string | null; contact_phone: string | null }>();

  for (const row of (data ?? []) as Array<{
    published_listing_id: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  }>) {
    if (!row.published_listing_id || contacts.has(row.published_listing_id)) {
      continue;
    }

    contacts.set(row.published_listing_id, {
      contact_email: row.contact_email,
      contact_phone: row.contact_phone,
    });
  }

  return contacts;
}

export async function getInquiryListings() {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin
      .from("tour_listings")
      .select(
        "id,title,location,country,duration,summary,image_url,price,operator_id,operator_name,featured,is_active,created_at,updated_at",
      )
      .eq("is_active", true)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingRelationError(error) || error.message?.includes("terminated")) {
        return [];
      }

      throw new Error(error.message);
    }

    return ((data ?? []) as TourListing[]).map((listing) => ({
      ...listing,
      image_url: normalizePublicListingImage(listing.image_url),
    }));
  } catch (error) {
    if (isFetchFailedError(error)) {
      return [];
    }

    console.error("Unable to load inquiry listings", error);
    return [];
  }
}

export async function getTravelerInquiryDashboard(userId: string) {
  try {
    const admin = createSupabaseServiceRoleClient();

    const { data: viewerProfile, error: viewerError } = await admin
      .from("profiles")
      .select("id,email,full_name,role")
      .eq("id", userId)
      .maybeSingle();

    if (viewerError) {
      if (isMissingRelationError(viewerError) || viewerError.message?.includes("schema cache")) {
        return {
          inquiries: [],
          featuredListings: [],
          countries: [],
          stats: {
            upcomingTrips: 0,
            savedJourneys: 0,
            inquiriesSent: 0,
            countriesVisited: 0,
          },
        };
      }

      throw new Error(viewerError.message);
    }

    const { data: inquiriesData, error: inquiriesError } = await admin
      .from("inquiries")
      .select(
        "id,user_id,listing_id,payment_amount,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (inquiriesError) {
      if (isMissingRelationError(inquiriesError)) {
        return {
          inquiries: [],
          featuredListings: [],
          countries: [],
          stats: {
            upcomingTrips: 0,
            savedJourneys: 0,
            inquiriesSent: 0,
            countriesVisited: 0,
          },
        };
      }

      throw new Error(inquiriesError.message);
    }

    const inquiries = (inquiriesData ?? []) as TravelerInquiry[];
    const fallbackEmail = normalizeText(viewerProfile?.email)?.toLowerCase() ?? null;
    let mergedInquiries = inquiries;

    if (fallbackEmail) {
      const { data: legacyInquiries, error: legacyError } = await admin
        .from("inquiries")
        .select(
          "id,user_id,listing_id,payment_amount,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at",
        )
        .is("user_id", null)
        .ilike("traveler_email", fallbackEmail);

      if (legacyError) {
        if (isMissingRelationError(legacyError) || legacyError.message?.includes("schema cache")) {
          return {
            inquiries: mergedInquiries.map((inquiry) => ({
              ...inquiry,
              listing: null,
              operator_email: null,
              operator_phone: null,
              review_id: null,
              has_review: false,
              can_review: false,
              payment: null,
            })),
            featuredListings: [],
            countries: [],
            stats: {
              upcomingTrips: 0,
              savedJourneys: 0,
              inquiriesSent: 0,
              countriesVisited: 0,
            },
          };
        }

        throw new Error(legacyError.message);
      }

      const existingIds = new Set(inquiries.map((item) => item.id));
      mergedInquiries = [
        ...inquiries,
        ...((legacyInquiries ?? []) as TravelerInquiry[]).filter((item) => !existingIds.has(item.id)),
      ];
    }

    const inquiriesForDashboard = mergedInquiries;
    const listingIds = [...new Set(inquiriesForDashboard.map((item) => item.listing_id).filter((value): value is string => Boolean(value)))];

    const { data: listingsData, error: listingsError } = listingIds.length
      ? await admin
          .from("tour_listings")
          .select("id,title,location,country,duration,summary,image_url,image_base64,price,operator_id,operator_name,featured,is_active,created_at,updated_at")
          .in("id", listingIds)
      : { data: [], error: null };

    if (listingsError) {
      if (isMissingRelationError(listingsError)) {
        return {
          inquiries: inquiriesForDashboard.map((inquiry) => ({
            ...inquiry,
            listing: null,
            operator_email: null,
            operator_phone: null,
            review_id: null,
            has_review: false,
            can_review: false,
            payment: null,
          })),
          featuredListings: [],
          countries: [],
          stats: {
            upcomingTrips: inquiriesForDashboard.filter((inquiry) =>
              ["submitted", "reviewed", "confirmed"].includes(inquiry.status),
            ).length,
            savedJourneys: 0,
            inquiriesSent: inquiriesForDashboard.length,
            countriesVisited: 0,
          },
        };
      }

      throw new Error(listingsError.message);
    }

    const listingsById = new Map<string, TourListing>(
      ((listingsData ?? []) as Array<TourListing & { image_base64?: string | null }>).map((listing) => [
        listing.id,
        {
          ...listing,
          image_url: normalizeMediaSource(listing.image_base64) ?? normalizeMediaSource(listing.image_url),
        },
      ]),
    );

    const inquiryIds = inquiriesForDashboard.map((inquiry) => inquiry.id);
    const reviewMap = await loadTravelerReviewMap(userId, inquiryIds);
    const draftContacts = await loadListingDraftContactsByListingIds(admin, listingIds);
    const payments = await getWiPayPaymentsForInquiryIds(inquiryIds).catch(() => []);
    const latestPaymentByInquiryId = new Map<string, (typeof payments)[number]>();

    for (const payment of payments) {
      if (!latestPaymentByInquiryId.has(payment.inquiry_id)) {
        latestPaymentByInquiryId.set(payment.inquiry_id, payment);
      }
    }
    const operatorProfilesById = new Map<string, { id: string; email: string | null; full_name: string; role: "operator" }>();

    const operatorIds = [
      ...new Set(
        inquiriesForDashboard
          .map((inquiry) => inquiry.operator_id ?? (inquiry.listing_id ? listingsById.get(inquiry.listing_id)?.operator_id ?? null : null))
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    if (operatorIds.length) {
      const { data: operatorProfiles, error: operatorProfilesError } = await admin
        .from("profiles")
        .select("id,email,full_name,role,avatar_base64,profile_image_url")
        .in("id", operatorIds);

      if (operatorProfilesError) {
        if (isMissingRelationError(operatorProfilesError) || operatorProfilesError.message?.includes("schema cache")) {
          // Continue with name-based fallback below.
        } else {
          throw new Error(operatorProfilesError.message);
        }
      }

      ((operatorProfiles ?? []) as Array<{
        id: string;
        email: string | null;
        full_name: string;
        role: "operator";
      }>).forEach((profile) => {
        operatorProfilesById.set(profile.id, profile);
      });
    }

    const operatorProfilesByName = new Map<string, { id: string; email: string | null; full_name: string; role: "operator" }>();
    const unresolvedNames = [
      ...new Set(
        inquiriesForDashboard
          .map((inquiry) => normalizeText(inquiry.operator_name))
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    for (const operatorName of unresolvedNames) {
      const resolvedProfile = await resolveUniqueOperatorProfileByName(admin, operatorName);
      if (resolvedProfile) {
        operatorProfilesByName.set(operatorName.toLowerCase(), resolvedProfile);
      }
    }

    const enrichedInquiries: InquiryConfirmation[] = inquiriesForDashboard.map((inquiry) => {
      const listing = inquiry.listing_id ? listingsById.get(inquiry.listing_id) ?? null : null;
      const operatorProfile =
        (inquiry.operator_id ? operatorProfilesById.get(inquiry.operator_id) ?? null : null) ??
        (operatorProfilesByName.get(normalizeText(inquiry.operator_name)?.toLowerCase() ?? "") ?? null) ??
        (listing?.operator_id ? operatorProfilesById.get(listing.operator_id) ?? null : null) ??
        null;
      const draftContact = listing?.id ? draftContacts.get(listing.id) ?? null : null;
      const review = reviewMap.get(inquiry.id) ?? null;

      return {
        ...inquiry,
        listing,
        operator_email: operatorProfile?.email ?? draftContact?.contact_email ?? null,
        operator_phone: draftContact?.contact_phone ?? null,
        review_id: review?.id ?? null,
        has_review: Boolean(review),
        can_review: canLeaveReview(inquiry.status, Boolean(review)),
        payment: latestPaymentByInquiryId.get(inquiry.id) ?? null,
      };
    });

    const featuredListings = (listingsData ?? [])
      .filter((listing) => (listing as TourListing).featured)
      .map((listing) => listing as TourListing)
      .slice(0, 3);

    const fallbackFeaturedListings =
      featuredListings.length > 0
        ? featuredListings
        : (listingsData ?? []).slice(0, 3).map((listing) => listing as TourListing);

    const countrySet = new Set<string>();
    enrichedInquiries.forEach((inquiry) => {
      if (inquiry.destination_country) {
        countrySet.add(inquiry.destination_country);
      }
      if (inquiry.listing?.country) {
        countrySet.add(inquiry.listing.country);
      }
    });

    if (!countrySet.size) {
      fallbackFeaturedListings.forEach((listing) => countrySet.add(listing.country));
    }

    return {
      inquiries: enrichedInquiries,
      featuredListings: fallbackFeaturedListings,
      countries: [...countrySet],
      stats: {
        upcomingTrips: enrichedInquiries.filter((inquiry) =>
          ["submitted", "reviewed", "confirmed"].includes(inquiry.status),
        ).length,
        savedJourneys: fallbackFeaturedListings.length,
        inquiriesSent: enrichedInquiries.length,
        countriesVisited: countrySet.size,
      },
    };
  } catch (error) {
    if (isMissingRelationError(error as { code?: string | null; message?: string | null })) {
      return {
        inquiries: [],
        featuredListings: [],
        countries: [],
        stats: {
          upcomingTrips: 0,
          savedJourneys: 0,
          inquiriesSent: 0,
          countriesVisited: 0,
        },
      };
    }

    throw error;
  }
}

export async function getInquiryConfirmation(
  inquiryId: string,
  viewer?: {
    id: string;
    email: string | null;
    full_name: string;
    role: "traveler" | "operator" | "admin";
  } | null,
) {
  const admin = createSupabaseServiceRoleClient();
  const { data: inquiry, error } = await admin
    .from("inquiries")
    .select(
      "id,user_id,listing_id,payment_amount,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at",
    )
    .eq("id", inquiryId)
    .maybeSingle();

  if (error || !inquiry) {
    if (isMissingRelationError(error)) {
      return null;
    }

    return null;
  }

  let listing: TourListing | null = null;

  if (inquiry.listing_id) {
    const { data: listingData } = await admin
      .from("tour_listings")
      .select("id,title,location,country,duration,summary,image_url,image_base64,price,operator_id,operator_name,featured,is_active,created_at,updated_at")
      .eq("id", inquiry.listing_id)
      .maybeSingle();

    listing = listingData
      ? ({
          ...(listingData as TourListing & { image_base64?: string | null }),
          image_url:
            normalizeMediaSource((listingData as { image_base64?: string | null }).image_base64) ??
            normalizeMediaSource(listingData.image_url),
        } as TourListing)
      : null;
  }

  if (viewer) {
    const viewerRole = viewer.role;
    const viewerEmail = normalizeText(viewer.email)?.toLowerCase() ?? null;
    const viewerName = normalizeText(viewer.full_name)?.toLowerCase() ?? null;

    if (viewerRole === "traveler") {
      const matchesOwner =
        inquiry.user_id === viewer.id ||
        (!inquiry.user_id && viewerEmail && normalizeText(inquiry.traveler_email)?.toLowerCase() === viewerEmail);

      if (!matchesOwner) {
        return null;
      }
    } else if (viewerRole === "operator") {
      const matchesOperator =
        inquiry.operator_id === viewer.id ||
        (!inquiry.operator_id && viewerName && normalizeText(inquiry.operator_name)?.toLowerCase() === viewerName) ||
        (listing?.operator_id === viewer.id);

      if (!matchesOperator) {
        return null;
      }
    }
  }

  const reviewOwnerId = inquiry.user_id ?? viewer?.id ?? null;
  const review = reviewOwnerId
    ? (await loadTravelerReviewMap(reviewOwnerId, [inquiry.id])).get(inquiry.id) ?? null
    : null;
  const payment = await getLatestWiPayPaymentForInquiry(inquiry.id).catch(() => null);

  let operatorEmail: string | null = null;
  let operatorPhone: string | null = null;
  let resolvedOperatorId = inquiry.operator_id ?? listing?.operator_id ?? null;

  if (!resolvedOperatorId && listing?.operator_name) {
    const resolvedOperator = await resolveUniqueOperatorProfileByName(admin, listing.operator_name);
    resolvedOperatorId = resolvedOperator?.id ?? resolvedOperatorId;
    operatorEmail = resolvedOperator?.email ?? null;
  }

  if (resolvedOperatorId) {
    const { data: operatorProfile } = await admin
      .from("profiles")
      .select("id,email,full_name,role,avatar_base64,profile_image_url")
      .eq("id", resolvedOperatorId)
      .maybeSingle();

    operatorEmail = operatorProfile?.email ?? operatorEmail;
  }

  if (listing?.id) {
    const draftContact = await loadListingDraftContactByListingId(admin, listing.id);
    operatorPhone = draftContact?.contact_phone ?? null;
    operatorEmail = operatorEmail ?? draftContact?.contact_email ?? null;
  }

  return {
    ...(inquiry as TravelerInquiry),
    listing,
    operator_email: operatorEmail,
    operator_phone: operatorPhone,
    review_id: review?.id ?? null,
    has_review: Boolean(review),
    can_review: canLeaveReview(inquiry.status, Boolean(review)),
    payment,
  } satisfies InquiryConfirmation;
}
