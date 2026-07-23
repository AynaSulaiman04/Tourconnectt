import "server-only";

import { createSupabaseServiceRoleClient } from "./server";
import type { OperatorListingDraftLike } from "@/lib/operator-listing-completion";
import type { TourListing, TravelerInquiry } from "./inquiry-types";
import type { TravelerProfile } from "./profile-types";
import { normalizeMediaSource } from "./media";
import { normalizeProfileImageSource } from "./profile-image";
import { getDirectMessagePageState } from "./direct-messages";
import { getTravelerCareProfiles, type TravelerCareProfile } from "./traveler-care";

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "42703" || error?.message?.includes("column") || error?.message?.includes("does not exist");
}

function isMissingRelationError(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "42P01" || error?.message?.includes("relation") || error?.message?.includes("does not exist");
}

function isSchemaCacheMiss(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error?.message?.includes("schema cache") ||
      error?.message?.includes("Could not find the table") ||
      error?.message?.includes("Could not find the relation") ||
      error?.message?.includes("public.tour_listings") ||
      error?.message?.includes("public.inquiries") ||
      error?.message?.includes("public.profiles"),
  );
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeListingRecord(listing: TourListing & { image_base64?: string | null }) {
  return {
    ...listing,
    image_url: normalizeMediaSource(listing.image_base64) ?? normalizeMediaSource(listing.image_url),
  } satisfies TourListing;
}

export type OperatorListingDraftRecord = OperatorListingDraftLike & {
  id: string;
  operator_id: string;
  is_published: boolean;
  published_listing_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OperatorCustomerRecord = TravelerProfile & {
  care_profile?: TravelerCareProfile | null;
  profile_id: string | null;
  traveler_phone: string | null;
  latest_inquiry_id: string | null;
  latest_inquiry_status: TravelerInquiry["status"] | null;
  latest_listing_title: string | null;
  latest_listing_location: string | null;
  preferred_start_date: string | null;
  preferred_end_date: string | null;
  availability: TravelerInquiry["availability"] | null;
  notes: string | null;
  inquiry_count: number;
  confirmed_booking_count: number;
  latest_activity_at: string;
  latest_message_preview: string | null;
  latest_conversation_id: string | null;
  latest_inquiry_created_at: string | null;
};

const draftSelect =
  "id,operator_id,title,location,country,duration,summary,category,price,availability,capacity,itinerary,inclusions,exclusions,contact_name,contact_email,contact_phone,image_url,image_base64,is_published,published_listing_id,created_at,updated_at";

const listingSelect =
  "id,title,location,country,duration,summary,image_url,image_base64,price,operator_id,operator_name,featured,is_active,created_at,updated_at";

const inquirySelect =
  "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at";

const profileSelect =
  "id,email,full_name,preferred_inquiry_area,role,is_active,status_reason,last_seen_at,created_at,updated_at,profile_image_url,avatar_base64";

export async function getOperatorListingDraft(profileId: string) {
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("operator_listing_drafts")
    .select(draftSelect)
    .eq("operator_id", profileId)
    .eq("is_published", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationError(error) || isSchemaCacheMiss(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  if (data) {
    return data as OperatorListingDraftRecord;
  }

  return null;
}

export async function getOperatorListingDrafts(profileId: string) {
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("operator_listing_drafts")
    .select(draftSelect)
    .eq("operator_id", profileId)
    .eq("is_published", false)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationError(error) || isSchemaCacheMiss(error)) {
      return [] as OperatorListingDraftRecord[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as OperatorListingDraftRecord[];
}

export async function getOperatorListingDraftById(profileId: string, draftId: string) {
  if (!isUuidLike(draftId)) {
    return null;
  }

  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("operator_listing_drafts")
    .select(draftSelect)
    .eq("id", draftId)
    .eq("operator_id", profileId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationError(error) || isSchemaCacheMiss(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (data ?? null) as OperatorListingDraftRecord | null;
}

export async function getOperatorListingDraftByPublishedListingId(profileId: string, listingId: string) {
  if (!isUuidLike(listingId)) {
    return null;
  }

  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("operator_listing_drafts")
    .select(draftSelect)
    .eq("operator_id", profileId)
    .eq("published_listing_id", listingId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationError(error) || isSchemaCacheMiss(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (data ?? null) as OperatorListingDraftRecord | null;
}

export async function getOperatorCustomerDirectory(profile: TravelerProfile) {
  const admin = createSupabaseServiceRoleClient();

  const query = admin
    .from("inquiries")
    .select(inquirySelect)
    .eq("operator_id", profile.id)
    .order("created_at", { ascending: false });

  const { data: inquiriesData, error } = await query;

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationError(error) || isSchemaCacheMiss(error)) {
      const fallback = await admin
        .from("inquiries")
        .select(
          "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at",
        )
        .eq("operator_name", profile.full_name.trim())
        .order("created_at", { ascending: false });

      if (fallback.error) {
        if (isMissingColumnError(fallback.error) || isMissingRelationError(fallback.error) || isSchemaCacheMiss(fallback.error)) {
          return buildOperatorCustomers([], [], new Map());
        }

        throw new Error(fallback.error.message);
      }

      return buildOperatorCustomers((fallback.data ?? []) as TravelerInquiry[], [], new Map());
    }

    throw new Error(error.message);
  }

  let inquiries = (inquiriesData ?? []) as (TravelerInquiry & { operator_id: string | null })[];

  if (!inquiries.length) {
    const { data: fallbackInquiries, error: fallbackInquiriesError } = await admin
      .from("inquiries")
      .select(
        "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at",
      )
      .eq("operator_name", profile.full_name.trim())
      .order("created_at", { ascending: false });

    if (fallbackInquiriesError) {
      if (isMissingColumnError(fallbackInquiriesError) || isMissingRelationError(fallbackInquiriesError) || isSchemaCacheMiss(fallbackInquiriesError)) {
        return buildOperatorCustomers([], [], new Map());
      }

      throw new Error(fallbackInquiriesError.message);
    }

    inquiries = (fallbackInquiries ?? []) as TravelerInquiry[];
  }

  const listingIds = [...new Set(inquiries.map((item) => item.listing_id).filter((value): value is string => Boolean(value)))];
  const directMessageState = await getDirectMessagePageState({
    profile,
    role: "operator",
    markAsSeen: false,
  });

  const conversationTravelerIds = [...new Set(directMessageState.conversations.map((conversation) => conversation.traveler_id))];
  const userIds = [
    ...new Set(
      [...inquiries.map((item) => item.user_id), ...conversationTravelerIds].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];

  let listingsData: TourListing[] = [];

  if (listingIds.length) {
    const listingsResult = await admin.from("tour_listings").select(listingSelect).in("id", listingIds);

    if (listingsResult.error) {
      if (isMissingColumnError(listingsResult.error) || isMissingRelationError(listingsResult.error) || isSchemaCacheMiss(listingsResult.error)) {
        const fallbackListings = await admin
          .from("tour_listings")
          .select(
            "id,title,location,country,duration,summary,image_url,image_base64,operator_name,featured,is_active,created_at,updated_at",
          )
          .in("id", listingIds);

        if (fallbackListings.error) {
          if (isMissingColumnError(fallbackListings.error) || isMissingRelationError(fallbackListings.error) || isSchemaCacheMiss(fallbackListings.error)) {
            listingsData = [];
          } else {
            throw new Error(fallbackListings.error.message);
          }
        }

        if (fallbackListings.data) {
          listingsData = ((fallbackListings.data ?? []) as Array<TourListing & { image_base64?: string | null }>).map(
            normalizeListingRecord,
          );
        }
      } else {
        throw new Error(listingsResult.error.message);
      }
    } else {
      listingsData = ((listingsResult.data ?? []) as Array<TourListing & { image_base64?: string | null }>).map(
        normalizeListingRecord,
      );
    }
  }

  let profilesData: TravelerProfile[] = [];

  if (userIds.length) {
    const withImage = await admin.from("profiles").select(profileSelect).in("id", userIds);

    if (withImage.error) {
      if (isMissingColumnError(withImage.error) || isMissingRelationError(withImage.error) || isSchemaCacheMiss(withImage.error)) {
        const withoutImage = await admin
          .from("profiles")
          .select("id,email,full_name,preferred_inquiry_area,role,created_at,updated_at,profile_image_url")
          .in("id", userIds);

        if (withoutImage.error) {
          if (isMissingColumnError(withoutImage.error) || isMissingRelationError(withoutImage.error) || isSchemaCacheMiss(withoutImage.error)) {
            return buildOperatorCustomers(inquiries, [], new Map());
          }

          throw new Error(withoutImage.error.message);
        }

        profilesData = (withoutImage.data ?? []).map((profile) => ({
          ...profile,
          profile_image_url:
            normalizeMediaSource((profile as { avatar_base64?: string | null } | null)?.avatar_base64) ??
            normalizeMediaSource((profile as { profile_image_url?: string | null } | null)?.profile_image_url),
          avatar_base64: null,
          is_active: true,
          status_reason: null,
          last_seen_at: null,
        })) as TravelerProfile[];
      } else {
        throw new Error(withImage.error.message);
      }
    } else {
      profilesData = ((withImage.data ?? []) as Array<TravelerProfile & { avatar_base64?: string | null }>).map((profile) => ({
        ...profile,
        profile_image_url:
          normalizeMediaSource((profile as { avatar_base64?: string | null } | null)?.avatar_base64) ??
          normalizeMediaSource((profile as { profile_image_url?: string | null } | null)?.profile_image_url),
      })) as TravelerProfile[];
    }
  }

  const careProfiles = await getTravelerCareProfiles(userIds);
  const careProfileByUserId = new Map(careProfiles.map((entry) => [entry.user_id, entry]));

  const customers = buildOperatorCustomers(
    inquiries,
    profilesData,
    new Map(listingsData.map((listing) => [listing.id, listing as TourListing])),
  );

  const profileById = new Map(profilesData.map((entry) => [entry.id, entry]));
  const customerByAlias = new Map<string, OperatorCustomerRecord>();

  const normalizeAlias = (value: string | null | undefined, prefix: string) =>
    value && value.trim().length > 0 ? `${prefix}:${value.trim().toLowerCase()}` : null;

  const registerAliases = (customer: OperatorCustomerRecord) => {
    const aliases = [
      normalizeAlias(customer.profile_id, "profile"),
      normalizeAlias(customer.email, "email"),
      normalizeAlias(customer.latest_inquiry_id, "inquiry"),
      normalizeAlias(customer.latest_conversation_id, "conversation"),
    ].filter((value): value is string => Boolean(value));

    for (const alias of aliases) {
      customerByAlias.set(alias, customer);
    }
  };

  const latestTime = (record: { latest_activity_at: string }) => new Date(record.latest_activity_at).getTime();

  for (const customer of customers) {
    registerAliases(customer);
  }

  const mergeCustomer = (existing: OperatorCustomerRecord, patch: Partial<OperatorCustomerRecord>) => {
    existing.profile_id = patch.profile_id ?? existing.profile_id;
    existing.traveler_phone = patch.traveler_phone ?? existing.traveler_phone;
    existing.latest_inquiry_id = patch.latest_inquiry_id ?? existing.latest_inquiry_id;
    existing.latest_inquiry_status = patch.latest_inquiry_status ?? existing.latest_inquiry_status;
    existing.latest_listing_title = patch.latest_listing_title ?? existing.latest_listing_title;
    existing.latest_listing_location = patch.latest_listing_location ?? existing.latest_listing_location;
    existing.preferred_start_date = patch.preferred_start_date ?? existing.preferred_start_date;
    existing.preferred_end_date = patch.preferred_end_date ?? existing.preferred_end_date;
    existing.availability = patch.availability ?? existing.availability;
    existing.notes = patch.notes ?? existing.notes;
    existing.inquiry_count = patch.inquiry_count ?? existing.inquiry_count;
    existing.confirmed_booking_count = patch.confirmed_booking_count ?? existing.confirmed_booking_count;
    existing.latest_activity_at = patch.latest_activity_at ?? existing.latest_activity_at;
    existing.latest_message_preview = patch.latest_message_preview ?? existing.latest_message_preview;
    existing.latest_conversation_id = patch.latest_conversation_id ?? existing.latest_conversation_id;
    existing.latest_inquiry_created_at = patch.latest_inquiry_created_at ?? existing.latest_inquiry_created_at;
    existing.profile_image_url = patch.profile_image_url ?? existing.profile_image_url;
    existing.is_active = patch.is_active ?? existing.is_active;
    existing.status_reason = patch.status_reason ?? existing.status_reason;
    existing.last_seen_at = patch.last_seen_at ?? existing.last_seen_at;
    existing.updated_at = patch.updated_at ?? existing.updated_at;
    existing.created_at = patch.created_at ?? existing.created_at;
    existing.full_name = patch.full_name ?? existing.full_name;
    existing.email = patch.email ?? existing.email;
    existing.role = patch.role ?? existing.role;
    existing.preferred_inquiry_area = patch.preferred_inquiry_area ?? existing.preferred_inquiry_area;

    registerAliases(existing);
    return existing;
  };

  for (const conversation of directMessageState.conversations) {
    const travelerProfile = conversation.traveler_id ? profileById.get(conversation.traveler_id) ?? null : null;
    const conversationTime = conversation.last_message_at ?? conversation.updated_at;
    const aliasCandidates = [
      normalizeAlias(travelerProfile?.id ?? conversation.traveler_id, "profile"),
      normalizeAlias(travelerProfile?.email ?? conversation.traveler_email, "email"),
      normalizeAlias(conversation.inquiry_id, "inquiry"),
      normalizeAlias(conversation.id, "conversation"),
    ].filter((value): value is string => Boolean(value));

    let customer: OperatorCustomerRecord | null = null;
    for (const alias of aliasCandidates) {
      customer = customerByAlias.get(alias) ?? null;
      if (customer) {
        break;
      }
    }

    const conversationPatch: Partial<OperatorCustomerRecord> = {
      profile_id: travelerProfile?.id ?? conversation.traveler_id ?? null,
      full_name: travelerProfile?.full_name ?? conversation.traveler_name,
      email: travelerProfile?.email ?? conversation.traveler_email ?? "",
      preferred_inquiry_area: travelerProfile?.preferred_inquiry_area ?? null,
      profile_image_url:
        normalizeProfileImageSource(travelerProfile?.avatar_base64) ??
        normalizeProfileImageSource(travelerProfile?.profile_image_url) ??
        null,
      role: (travelerProfile?.role ?? "traveler") as TravelerProfile["role"],
      is_active: travelerProfile?.is_active ?? true,
      status_reason: travelerProfile?.status_reason ?? null,
      last_seen_at: travelerProfile?.last_seen_at ?? conversationTime,
      created_at: travelerProfile?.created_at ?? conversation.created_at,
      updated_at: travelerProfile?.updated_at ?? conversation.updated_at,
      traveler_phone: null,
      latest_inquiry_id: conversation.inquiry_id,
      latest_inquiry_status: conversation.inquiry_status,
      latest_listing_title: conversation.listing_title,
      latest_listing_location: conversation.listing_location,
      preferred_start_date: null,
      preferred_end_date: null,
      availability: null,
      notes: null,
      inquiry_count: conversation.inquiry_id ? 1 : 0,
      confirmed_booking_count: conversation.inquiry_status === "confirmed" ? 1 : 0,
      latest_activity_at: conversationTime,
      latest_message_preview: conversation.last_message_preview,
      latest_conversation_id: conversation.id,
      latest_inquiry_created_at: conversation.inquiry_id ? conversationTime : null,
    };

    if (!customer) {
      const baseCustomer: OperatorCustomerRecord = {
        id: conversation.inquiry_id ?? conversation.id,
        ...conversationPatch,
      } as OperatorCustomerRecord;
      customerByAlias.set(normalizeAlias(baseCustomer.profile_id, "profile") ?? `conversation:${conversation.id}`, baseCustomer);
      registerAliases(baseCustomer);
      continue;
    }

    const existingTime = latestTime(customer);
    const shouldPromoteConversation = new Date(conversationTime).getTime() >= existingTime;

    const mergedPatch: Partial<OperatorCustomerRecord> = {
      profile_id: travelerProfile?.id ?? customer.profile_id,
      full_name: travelerProfile?.full_name ?? customer.full_name,
      email: travelerProfile?.email ?? conversation.traveler_email ?? customer.email,
      preferred_inquiry_area: travelerProfile?.preferred_inquiry_area ?? customer.preferred_inquiry_area,
      profile_image_url:
        normalizeProfileImageSource(travelerProfile?.avatar_base64) ??
        normalizeProfileImageSource(travelerProfile?.profile_image_url) ??
        customer.profile_image_url,
      role: (travelerProfile?.role ?? customer.role) as TravelerProfile["role"],
      is_active: travelerProfile?.is_active ?? customer.is_active,
      status_reason: travelerProfile?.status_reason ?? customer.status_reason,
      last_seen_at: travelerProfile?.last_seen_at ?? customer.last_seen_at,
      created_at: travelerProfile?.created_at ?? customer.created_at,
      updated_at: travelerProfile?.updated_at ?? customer.updated_at,
      traveler_phone: travelerProfile?.email ? customer.traveler_phone : customer.traveler_phone,
      inquiry_count: customer.inquiry_count + (conversation.inquiry_id && !customer.latest_inquiry_id ? 1 : 0),
      confirmed_booking_count:
        customer.confirmed_booking_count + (conversation.inquiry_status === "confirmed" && !customer.latest_inquiry_id ? 1 : 0),
    };

    if (shouldPromoteConversation) {
      mergedPatch.latest_activity_at = conversationTime;
      mergedPatch.latest_message_preview = conversation.last_message_preview ?? customer.latest_message_preview;
      mergedPatch.latest_conversation_id = conversation.id;
      mergedPatch.latest_inquiry_id = conversation.inquiry_id ?? customer.latest_inquiry_id;
      mergedPatch.latest_inquiry_status = conversation.inquiry_status ?? customer.latest_inquiry_status;
      mergedPatch.latest_listing_title = conversation.listing_title ?? customer.latest_listing_title;
      mergedPatch.latest_listing_location = conversation.listing_location ?? customer.latest_listing_location;
      mergedPatch.latest_inquiry_created_at = conversation.inquiry_id ? conversationTime : customer.latest_inquiry_created_at;
    }

    const updated = mergeCustomer(customer, mergedPatch);
    customerByAlias.set(normalizeAlias(updated.profile_id, "profile") ?? `conversation:${conversation.id}`, updated);
    customerByAlias.set(normalizeAlias(updated.email, "email") ?? `conversation:${conversation.id}`, updated);
    if (updated.latest_inquiry_id) {
      customerByAlias.set(normalizeAlias(updated.latest_inquiry_id, "inquiry") ?? `conversation:${conversation.id}`, updated);
    }
    customerByAlias.set(normalizeAlias(conversation.id, "conversation") ?? `conversation:${conversation.id}`, updated);
  }

  return [...new Set(customerByAlias.values())]
    .map((customer) => ({
      ...customer,
      care_profile: customer.profile_id ? careProfileByUserId.get(customer.profile_id) ?? null : null,
    }))
    .sort((left, right) => new Date(right.latest_activity_at).getTime() - new Date(left.latest_activity_at).getTime());
}

export async function getOperatorListings(profileId: string, operatorName: string) {
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("tour_listings")
    .select(listingSelect)
    .eq("operator_id", profileId)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationError(error) || isSchemaCacheMiss(error)) {
      const fallback = await admin
        .from("tour_listings")
        .select(
          "id,title,location,country,duration,summary,image_url,image_base64,operator_name,featured,is_active,created_at,updated_at",
        )
        .eq("operator_name", operatorName)
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });

      if (fallback.error) {
        if (isMissingColumnError(fallback.error) || isMissingRelationError(fallback.error) || isSchemaCacheMiss(fallback.error)) {
          return [];
        }

        throw new Error(fallback.error.message);
      }

      return ((fallback.data ?? []) as Array<TourListing & { image_base64?: string | null }>).map(
        normalizeListingRecord,
      );
    }

    throw new Error(error.message);
  }

  let listings = (data ?? []) as TourListing[];

  if (!listings.length) {
    const { data: fallbackListings, error: fallbackListingsError } = await admin
      .from("tour_listings")
      .select(
        "id,title,location,country,duration,summary,image_url,image_base64,operator_name,featured,is_active,created_at,updated_at",
      )
      .eq("operator_name", operatorName)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (fallbackListingsError) {
      if (isMissingColumnError(fallbackListingsError) || isMissingRelationError(fallbackListingsError) || isSchemaCacheMiss(fallbackListingsError)) {
      return [];
      }

      throw new Error(fallbackListingsError.message);
    }

    listings = ((fallbackListings ?? []) as Array<TourListing & { image_base64?: string | null }>).map(
      normalizeListingRecord,
    );
  }

  return listings;
}

export async function getOperatorListingById(profileId: string, listingId: string) {
  if (!isUuidLike(listingId)) {
    return null;
  }

  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("tour_listings")
    .select(listingSelect)
    .eq("id", listingId)
    .eq("operator_id", profileId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationError(error) || isSchemaCacheMiss(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return data ? (normalizeListingRecord(data as TourListing & { image_base64?: string | null }) as TourListing) : null;
}

export async function getOperatorInquiries(profileId: string, operatorName: string) {
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("inquiries")
    .select(inquirySelect)
    .eq("operator_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationError(error) || isSchemaCacheMiss(error)) {
      const fallback = await admin
        .from("inquiries")
        .select(
          "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at",
        )
        .eq("operator_name", operatorName)
        .order("created_at", { ascending: false });

      if (fallback.error) {
        if (isMissingColumnError(fallback.error) || isMissingRelationError(fallback.error) || isSchemaCacheMiss(fallback.error)) {
          return [];
        }

        throw new Error(fallback.error.message);
      }

      return (fallback.data ?? []) as TravelerInquiry[];
    }

    throw new Error(error.message);
  }

  let inquiries = (data ?? []) as TravelerInquiry[];

  if (!inquiries.length) {
    const { data: fallbackInquiries, error: fallbackInquiriesError } = await admin
      .from("inquiries")
      .select(
        "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at",
      )
      .eq("operator_name", operatorName)
      .order("created_at", { ascending: false });

    if (fallbackInquiriesError) {
      if (isMissingColumnError(fallbackInquiriesError) || isMissingRelationError(fallbackInquiriesError) || isSchemaCacheMiss(fallbackInquiriesError)) {
        return [];
      }

      throw new Error(fallbackInquiriesError.message);
    }

    inquiries = (fallbackInquiries ?? []) as TravelerInquiry[];
  }

  return inquiries;
}

function buildOperatorCustomers(
  inquiries: (TravelerInquiry & { user_id: string | null })[],
  profiles: TravelerProfile[],
  listingsById: Map<string, TourListing>,
): OperatorCustomerRecord[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const customerByKey = new Map<string, OperatorCustomerRecord>();

  for (const inquiry of inquiries) {
    const profile = inquiry.user_id ? profileById.get(inquiry.user_id) ?? null : null;
    const key = inquiry.user_id ?? inquiry.traveler_email.toLowerCase().trim();
    const existing = customerByKey.get(key);

    const baseCustomer: OperatorCustomerRecord = {
      id: inquiry.id,
      profile_id: profile?.id ?? inquiry.user_id ?? null,
      full_name: profile?.full_name ?? inquiry.traveler_name,
      email: profile?.email ?? inquiry.traveler_email,
      preferred_inquiry_area: profile?.preferred_inquiry_area ?? null,
      profile_image_url:
        normalizeProfileImageSource(profile?.avatar_base64) ??
        normalizeProfileImageSource(profile?.profile_image_url) ??
        null,
      role: "traveler",
      is_active: profile?.is_active ?? true,
      status_reason: profile?.status_reason ?? null,
      last_seen_at: profile?.last_seen_at ?? inquiry.created_at,
      created_at: profile?.created_at ?? inquiry.created_at,
      updated_at: profile?.updated_at ?? inquiry.updated_at,
      traveler_phone: inquiry.traveler_phone,
      latest_inquiry_id: inquiry.id,
      latest_inquiry_status: inquiry.status,
      latest_listing_title: inquiry.listing_id ? listingsById.get(inquiry.listing_id)?.title ?? null : null,
      latest_listing_location: inquiry.listing_id ? listingsById.get(inquiry.listing_id)?.location ?? inquiry.destination : inquiry.destination,
      preferred_start_date: inquiry.preferred_start_date,
      preferred_end_date: inquiry.preferred_end_date,
      availability: inquiry.availability,
      notes: inquiry.notes,
      inquiry_count: 1,
      confirmed_booking_count: inquiry.status === "confirmed" ? 1 : 0,
      latest_activity_at: inquiry.updated_at ?? inquiry.created_at,
      latest_message_preview: null,
      latest_conversation_id: null,
      latest_inquiry_created_at: inquiry.created_at,
    };

    if (!existing) {
      customerByKey.set(key, baseCustomer);
      continue;
    }

    customerByKey.set(key, {
      ...existing,
      latest_inquiry_id: inquiry.id,
      latest_inquiry_status: inquiry.status,
      latest_listing_title: baseCustomer.latest_listing_title ?? existing.latest_listing_title,
      latest_listing_location: baseCustomer.latest_listing_location ?? existing.latest_listing_location,
      preferred_start_date: inquiry.preferred_start_date ?? existing.preferred_start_date,
      preferred_end_date: inquiry.preferred_end_date ?? existing.preferred_end_date,
      availability: inquiry.availability,
      notes: inquiry.notes ?? existing.notes,
      inquiry_count: existing.inquiry_count + 1,
      confirmed_booking_count:
        existing.confirmed_booking_count + (inquiry.status === "confirmed" ? 1 : 0),
      latest_activity_at: inquiry.updated_at ?? inquiry.created_at,
      latest_message_preview: existing.latest_message_preview,
      latest_conversation_id: existing.latest_conversation_id,
      latest_inquiry_created_at: inquiry.created_at,
      traveler_phone: inquiry.traveler_phone ?? existing.traveler_phone,
      is_active: profile?.is_active ?? existing.is_active,
      status_reason: profile?.status_reason ?? existing.status_reason,
      last_seen_at: profile?.last_seen_at ?? existing.last_seen_at,
      updated_at: profile?.updated_at ?? inquiry.updated_at,
      profile_image_url:
        normalizeProfileImageSource(profile?.avatar_base64) ??
        normalizeProfileImageSource(profile?.profile_image_url) ??
        existing.profile_image_url,
    });
  }

  return [...customerByKey.values()].sort(
    (left, right) =>
      new Date(right.latest_activity_at).getTime() - new Date(left.latest_activity_at).getTime(),
  );
}
