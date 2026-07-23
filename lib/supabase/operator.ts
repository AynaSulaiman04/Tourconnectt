import "server-only";

import { redirect } from "next/navigation";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "./profile";
import { normalizeMediaSource } from "./media";
import { createSupabaseServiceRoleClient } from "./server";
import type { TourListing, TravelerInquiry } from "./inquiry-types";
import type { TravelerProfile } from "./profile-types";
import {
  getWiPayPaymentsForInquiryIds,
  type WiPayPaymentSummary,
} from "@/lib/payments/wipay";
import {
  getOperatorInquiries,
  getOperatorListings,
  getOperatorListingDrafts,
  getOperatorCustomerDirectory as getOperatorCustomerDirectoryFromListings,
} from "./operator-listings";

const OPERATOR_DOCUMENTS_BUCKET = "operator-documents";

type OperatorInquiry = TravelerInquiry & {
  listing: TourListing | null;
  payment: WiPayPaymentSummary | null;
};

export type OperatorWorkspaceData = {
  profile: TravelerProfile;
  listings: TourListing[];
  drafts: Awaited<ReturnType<typeof getOperatorListingDrafts>>;
  inquiries: OperatorInquiry[];
  recentInquiries: OperatorInquiry[];
  featuredListing: TourListing | null;
  countries: string[];
  stats: {
    activeListings: number;
    totalListings: number;
    draftListings: number;
    pendingInquiries: number;
    confirmedTrips: number;
    countriesCovered: number;
  };
};

export type OperatorDirectoryProfile = TravelerProfile & {
  profile_image_url: string | null;
};

export type OperatorSettings = {
  id: string;
  response_cadence: "fast_turnaround" | "same_day" | "daily";
  booking_workflow: "inquiry_first" | "review_then_confirm" | "manual_hold";
  customer_records: "documented" | "concierge_notes" | "shared_vault";
  communication_mode: "email" | "whatsapp" | "email_whatsapp";
  inquiry_received_enabled: boolean;
  booking_approved_enabled: boolean;
  guest_message_enabled: boolean;
  customer_note_enabled: boolean;
  updated_at: string;
  created_at: string;
};

export type OperatorDocumentRecord = {
  id: string;
  operator_id: string;
  inquiry_id: string | null;
  booking_id?: string | null;
  guest_name: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_url: string;
  mime_type: string;
  status: "pending" | "shared" | "complete" | "sensitive" | "archived";
  access_level?: "private" | "shared" | "restricted";
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OperatorDocumentShareRecord = {
  id: string;
  document_id: string;
  shared_with_profile_id: string;
  shared_by_profile_id: string | null;
  access_level: "viewer" | "editor";
  created_at: string;
};

function isMissingRelationOrSchemaCacheError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

export async function requireOperatorProfile() {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile) {
    redirect("/LoginPage");
  }

  if (profileContext.profile.role !== "operator") {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  return profileContext.profile;
}

export async function getOperatorWorkspaceData() {
  const operatorProfile = await requireOperatorProfile();
  const operatorName = operatorProfile.full_name.trim();
  const [listings, drafts, inquiries] = await Promise.all([
    getOperatorListings(operatorProfile.id, operatorName),
    getOperatorListingDrafts(operatorProfile.id),
    getOperatorInquiries(operatorProfile.id, operatorName),
  ]);

  const listingById = new Map<string, TourListing>(
    listings.map((listing) => [listing.id, listing]),
  );
  const inquiryIds = inquiries.map((inquiry) => inquiry.id);
  const payments = await getWiPayPaymentsForInquiryIds(inquiryIds).catch(() => []);
  const latestPaymentByInquiryId = new Map<string, WiPayPaymentSummary>();

  for (const payment of payments) {
    if (!latestPaymentByInquiryId.has(payment.inquiry_id)) {
      latestPaymentByInquiryId.set(payment.inquiry_id, payment);
    }
  }

  const inquiriesWithPayments: OperatorInquiry[] = inquiries.map((inquiry) => ({
    ...inquiry,
    listing: inquiry.listing_id ? listingById.get(inquiry.listing_id) ?? null : null,
    payment: latestPaymentByInquiryId.get(inquiry.id) ?? null,
  }));

  const recentInquiries: OperatorInquiry[] = inquiriesWithPayments.slice(0, 6);

  const featuredListing =
    listings.find((listing) => listing.featured) ?? listings[0] ?? null;

  const countries = new Set<string>();
  listings.forEach((listing) => {
    if (listing.country) {
      countries.add(listing.country);
    }
  });
  inquiries.forEach((inquiry) => {
    if (inquiry.destination_country) {
      countries.add(inquiry.destination_country);
    }
    if (inquiry.listing_id) {
      const listing = listingById.get(inquiry.listing_id);
      if (listing?.country) {
        countries.add(listing.country);
      }
    }
  });

  return {
    profile: operatorProfile,
    listings,
    inquiries: inquiriesWithPayments,
    drafts,
    recentInquiries,
    featuredListing,
    countries: [...countries],
    stats: {
      activeListings: listings.filter((listing) => listing.is_active).length,
      totalListings: listings.length,
      draftListings: drafts.length,
      pendingInquiries: inquiriesWithPayments.filter((item) => ["submitted", "reviewed"].includes(item.status)).length,
      confirmedTrips: inquiriesWithPayments.filter((item) => item.status === "confirmed").length,
      countriesCovered: countries.size,
    },
  } satisfies OperatorWorkspaceData;
}

export async function getOperatorSettings(profileId: string) {
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("operator_settings")
    .select("id,response_cadence,booking_workflow,customer_records,communication_mode,inquiry_received_enabled,booking_approved_enabled,guest_message_enabled,customer_note_enabled,updated_at,created_at")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error) || error.message?.includes("column")) {
      return {
        id: profileId,
        response_cadence: "fast_turnaround",
        booking_workflow: "inquiry_first",
        customer_records: "documented",
        communication_mode: "email",
        inquiry_received_enabled: true,
        booking_approved_enabled: true,
        guest_message_enabled: true,
        customer_note_enabled: true,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } satisfies OperatorSettings;
    }

    throw new Error(error.message);
  }

  if (data) {
    return data as OperatorSettings;
  }

  const { error: upsertError } = await admin.from("operator_settings").upsert(
    { id: profileId },
    { onConflict: "id" },
  );

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const { data: created } = await admin
    .from("operator_settings")
    .select("id,response_cadence,booking_workflow,customer_records,communication_mode,inquiry_received_enabled,booking_approved_enabled,guest_message_enabled,customer_note_enabled,updated_at,created_at")
    .eq("id", profileId)
    .maybeSingle();

  if (!created) {
    throw new Error("Unable to load operator settings.");
  }

  return created as OperatorSettings;
}

export async function getOperatorDocuments(profileId: string) {
  const admin = createSupabaseServiceRoleClient();

  const documentSelect =
    "id,operator_id,inquiry_id,booking_id,guest_name,document_type,file_name,file_path,file_url,mime_type,status,access_level,notes,uploaded_by,created_at,updated_at";

  const { data, error } = await admin
    .from("operator_documents")
    .select(documentSelect)
    .eq("operator_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error) || error.message?.includes("column")) {
      console.warn("[operator] operator_documents table is unavailable; returning an empty document list.");
      return [];
    }

    throw new Error(error.message);
  }

  const documents = (data ?? []) as OperatorDocumentRecord[];

  return Promise.all(
    documents.map(async (document) => {
      if (!document.file_path) {
        return document;
      }

      const { data: signedUrl, error: signedUrlError } = await admin.storage
        .from(OPERATOR_DOCUMENTS_BUCKET)
        .createSignedUrl(document.file_path, 60 * 60);

      if (!signedUrlError && signedUrl?.signedUrl) {
        return {
          ...document,
          file_url: signedUrl.signedUrl,
        };
      }

      return document;
    }),
  );
}

export async function getOperatorDocumentShares(profileId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("operator_document_shares")
    .select("id,document_id,shared_with_profile_id,shared_by_profile_id,access_level,created_at")
    .or(`shared_by_profile_id.eq.${profileId},shared_with_profile_id.eq.${profileId}`)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error) || error.message?.includes("column")) {
      return [] as OperatorDocumentShareRecord[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as OperatorDocumentShareRecord[];
}

export async function getOperatorTeamProfiles(profileId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,full_name,preferred_inquiry_area,role,is_active,status_reason,last_seen_at,created_at,updated_at,profile_image_url,avatar_base64")
    .in("role", ["operator", "admin"])
    .neq("id", profileId)
    .order("full_name", { ascending: true });

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error) || error.message?.includes("column")) {
      return [] as OperatorDirectoryProfile[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as Array<TravelerProfile & { profile_image_url?: string | null; avatar_base64?: string | null }>).map(
    (profile) => ({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      preferred_inquiry_area: profile.preferred_inquiry_area,
      role: profile.role,
      is_active: profile.is_active,
      status_reason: profile.status_reason,
      last_seen_at: profile.last_seen_at,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      profile_image_url:
        normalizeMediaSource(profile.avatar_base64) ?? normalizeMediaSource(profile.profile_image_url),
    }),
  );
}

export async function getOperatorCustomerDirectory(profile: TravelerProfile) {
  return getOperatorCustomerDirectoryFromListings(profile);
}

export async function getOperatorDirectoryProfiles() {
  const operator = await requireOperatorProfile();
  const customers = await getOperatorCustomerDirectoryFromListings(operator);

  return customers.map((customer) => ({
    id: customer.profile_id ?? customer.id,
    email: customer.email,
    full_name: customer.full_name,
    preferred_inquiry_area: customer.preferred_inquiry_area,
    role: customer.role,
    is_active: customer.is_active,
    status_reason: customer.status_reason,
    last_seen_at: customer.last_seen_at,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
    profile_image_url: customer.profile_image_url,
  })) as OperatorDirectoryProfile[];
}
