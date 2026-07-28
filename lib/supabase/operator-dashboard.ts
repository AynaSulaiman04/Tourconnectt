import "server-only";

import { createSupabaseServiceRoleClient } from "./server";
import { normalizeMediaSource } from "./media";
import { normalizeProfileImageSource } from "./profile-image";
import { getDirectMessagePageState } from "./direct-messages";
import { countUnreadPlatformNotifications } from "./notifications";
import { requireOperatorProfile } from "./operator";
import {
  sumAdminCommission,
  getWiPayPaymentsForInquiryIds,
  isSuccessfulWiPayPayment,
  sumOperatorPayout,
  sumSuccessfulWiPayPayments,
  type WiPayPaymentSummary,
} from "@/lib/payments/wipay";
import type { TravelerInquiry, TourListing } from "./inquiry-types";
import type { TravelerProfile } from "./profile-types";

type OperatorListingDraftSummary = {
  id: string;
  published_listing_id: string | null;
  updated_at: string;
  operator_id: string;
};

export type OperatorDashboardListingSummary = TourListing & {
  draft_id: string | null;
};

export type OperatorDashboardInquirySummary = TravelerInquiry & {
  listing_title: string | null;
  listing_location: string | null;
  listing_image_url: string | null;
  traveler_image_url: string | null;
  latest_message_preview: string | null;
  latest_conversation_id: string | null;
  latest_activity_at: string;
  payment: WiPayPaymentSummary | null;
};

export type OperatorPaymentRecord = WiPayPaymentSummary & {
  traveler_name: string;
  listing_title: string | null;
};

export type OperatorDashboardData = {
  profile: TravelerProfile;
  liveListingsCount: number;
  pendingInquiriesCount: number;
  confirmedTripsCount: number;
  estimatedRevenue: number;
  operatorPayoutBalance: number;
  platformCommissionTotal: number;
  unreadNotificationsCount: number;
  directMessageState: Awaited<ReturnType<typeof getDirectMessagePageState>>;
  recentListings: OperatorDashboardListingSummary[];
  bookings: OperatorDashboardInquirySummary[];
  recentInquiries: OperatorDashboardInquirySummary[];
  payments: OperatorPaymentRecord[];
  recentPayments: OperatorPaymentRecord[];
  paymentCount: number;
};

const listingSelect =
  "id,title,location,country,duration,summary,image_url,image_base64,price,operator_id,operator_name,featured,is_active,created_at,updated_at";

const inquirySelect =
  "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at";

const profileSelect =
  "id,full_name,email,role,profile_image_url,avatar_base64,preferred_inquiry_area,created_at,updated_at";

const draftSelect = "id,published_listing_id,updated_at";
const draftCountSelect = "id,operator_id,published_listing_id,updated_at";

const pendingInquiryStatuses = new Set([
  "submitted",
  "pending",
  "new",
  "under_review",
  "awaiting_response",
  "reviewed",
]);

const confirmedInquiryStatuses = new Set(["confirmed", "approved", "booked"]);

function normalizeListingImageSource(listing: { image_url: string | null; image_base64?: string | null }) {
  return normalizeMediaSource(listing.image_base64) ?? normalizeMediaSource(listing.image_url) ?? null;
}

async function loadOperatorListings(profileId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("tour_listings")
    .select(listingSelect)
    .eq("operator_id", profileId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const listings = (data ?? []) as TourListing[];

  return listings.map((listing) => ({
    ...listing,
    image_url: normalizeListingImageSource(listing),
  }));
}

async function loadOperatorInquiries(profileId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("inquiries")
    .select(inquirySelect)
    .eq("operator_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TravelerInquiry[];
}

async function loadDraftLookup(profileId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("operator_listing_drafts")
    .select(draftSelect)
    .eq("operator_id", profileId)
    .order("updated_at", { ascending: false });

  if (error) {
    return new Map<string, string>();
  }

  const drafts = (data ?? []) as OperatorListingDraftSummary[];
  return new Map(drafts.filter((draft) => draft.published_listing_id).map((draft) => [draft.published_listing_id as string, draft.id]));
}

async function loadOperatorDrafts(profileId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("operator_listing_drafts")
    .select(draftCountSelect)
    .eq("operator_id", profileId)
    .eq("is_published", false)
    .order("updated_at", { ascending: false });

  if (error) {
    return [] as OperatorListingDraftSummary[];
  }

  return (data ?? []) as OperatorListingDraftSummary[];
}

async function loadTravelerProfiles(userIds: string[]) {
  if (!userIds.length) {
    return new Map<string, { id: string; full_name: string; email: string | null; profile_image_url: string | null }>();
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("profiles")
    .select(profileSelect)
    .in("id", userIds);

  if (error) {
    return new Map<string, { id: string; full_name: string; email: string | null; profile_image_url: string | null }>();
  }

  return new Map(
    ((data ?? []) as Array<TravelerProfile & { avatar_base64?: string | null }>).map((profile) => [
      profile.id,
      {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        profile_image_url:
          normalizeProfileImageSource((profile as { avatar_base64?: string | null } | null)?.avatar_base64) ??
          normalizeProfileImageSource((profile as { profile_image_url?: string | null } | null)?.profile_image_url),
      },
    ]),
  );
}

export async function getOperatorDashboardData(): Promise<OperatorDashboardData> {
  const profile = await requireOperatorProfile();

  const [listings, inquiries, drafts, draftLookup, unreadNotificationsCount, directMessageState] = await Promise.all([
    loadOperatorListings(profile.id),
    loadOperatorInquiries(profile.id),
    loadOperatorDrafts(profile.id),
    loadDraftLookup(profile.id),
    countUnreadPlatformNotifications(profile.id).catch(() => 0),
    getDirectMessagePageState({
      profile,
      role: "operator",
      markAsSeen: false,
    }).catch(
      () =>
        ({
          conversations: [],
          activeConversation: null,
          messages: [],
          context: null,
        }) as Awaited<ReturnType<typeof getDirectMessagePageState>>,
    ),
  ]);

  const listingById = new Map<string, TourListing>(listings.map((listing) => [listing.id, listing]));
  const travelerIds = [...new Set(inquiries.map((inquiry) => inquiry.user_id).filter((value): value is string => Boolean(value)))] ;
  const travelerProfiles = await loadTravelerProfiles(travelerIds);
  const inquiryIds = inquiries.map((inquiry) => inquiry.id);
  const payments = await getWiPayPaymentsForInquiryIds(inquiryIds).catch(() => []);

  const conversationByInquiryId = new Map(
    directMessageState.conversations
      .filter((conversation) => Boolean(conversation.inquiry_id))
      .map((conversation) => [conversation.inquiry_id as string, conversation]),
  );
  const conversationByTravelerId = new Map(
    directMessageState.conversations.map((conversation) => [conversation.traveler_id, conversation]),
  );
  const paymentByInquiryId = new Map<string, WiPayPaymentSummary>();
  const paymentRecords: OperatorPaymentRecord[] = payments
    .map((payment) => {
      if (!paymentByInquiryId.has(payment.inquiry_id)) {
        paymentByInquiryId.set(payment.inquiry_id, payment);
      }

      const inquiry = inquiries.find((item) => item.id === payment.inquiry_id);
      const listing = inquiry?.listing_id ? listingById.get(inquiry.listing_id) ?? null : null;

      return {
        ...payment,
        traveler_name: inquiry?.traveler_name ?? "Traveler",
        listing_title: listing?.title ?? inquiry?.destination ?? null,
      };
    })
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  const recentPayments = paymentRecords.slice(0, 6);

  const recentListings = listings.slice(0, 4).map((listing) => ({
    ...listing,
    draft_id: draftLookup.get(listing.id) ?? null,
  }));

  const bookings = inquiries
    .map((inquiry) => {
    const travelerProfile = inquiry.user_id ? travelerProfiles.get(inquiry.user_id) ?? null : null;
    const listing = inquiry.listing_id ? listingById.get(inquiry.listing_id) ?? null : null;
    const conversation =
      (inquiry.id ? conversationByInquiryId.get(inquiry.id) ?? null : null) ??
      (inquiry.user_id ? conversationByTravelerId.get(inquiry.user_id) ?? null : null);
    const latestActivityAt = conversation?.last_message_at ?? inquiry.updated_at ?? inquiry.created_at;

    return {
      ...inquiry,
      listing_title: listing?.title ?? inquiry.destination,
      listing_location: listing?.location ?? inquiry.destination_country,
      listing_image_url: listing?.image_url ?? null,
      traveler_image_url: travelerProfile?.profile_image_url ?? null,
      latest_message_preview: conversation?.last_message_preview ?? inquiry.notes ?? null,
      latest_conversation_id: conversation?.id ?? null,
      latest_activity_at: latestActivityAt,
      payment: paymentByInquiryId.get(inquiry.id) ?? null,
    };
    })
    .sort((left, right) => new Date(right.latest_activity_at).getTime() - new Date(left.latest_activity_at).getTime());
  const recentInquiries = bookings.slice(0, 4);

  const liveListingsCount = listings.length + drafts.length;
  const pendingInquiriesCount = inquiries.filter((inquiry) => pendingInquiryStatuses.has(inquiry.status)).length;
  const confirmedTripsCount = inquiries.filter((inquiry) => confirmedInquiryStatuses.has(inquiry.status)).length;

  const estimatedRevenue = sumSuccessfulWiPayPayments(payments);
  const operatorPayoutBalance = sumOperatorPayout(payments);
  const platformCommissionTotal = sumAdminCommission(payments);

  return {
    profile,
    liveListingsCount,
    pendingInquiriesCount,
    confirmedTripsCount,
    estimatedRevenue,
    operatorPayoutBalance,
    platformCommissionTotal,
    unreadNotificationsCount,
    directMessageState,
    recentListings,
    bookings,
    recentInquiries,
    payments: paymentRecords,
    recentPayments,
    paymentCount: payments.filter((payment) => isSuccessfulWiPayPayment(payment.status)).length,
  };
}
