import "server-only";

import { redirect } from "next/navigation";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "./profile";
import { normalizeMediaSource } from "./media";
import { createSupabaseServiceRoleClient } from "./server";
import {
  getAdminWorkspaceSettings,
  getPlatformEvents,
  getReferralCampaigns,
} from "./analytics";
import {
  PLATFORM_ADMIN_COMMISSION_RATE,
  getWiPayPaymentsForInquiryIds,
  isSuccessfulWiPayPayment,
  sumAdminCommission,
  sumOperatorPayout,
  sumSuccessfulWiPayPayments,
  type WiPayPaymentSummary,
} from "@/lib/payments/wipay";
import { formatDate } from "@/lib/format/date";
import type { TourListing, TravelerInquiry } from "./inquiry-types";
import type { TravelerProfile } from "./profile-types";
import { getTravelerCareProfiles, type TravelerCareProfile } from "./traveler-care";

type DbError = { code?: string | null; message?: string | null } | null;

type AdminProfileRecord = TravelerProfile & {
  profile_image_url: string | null;
  avatar_base64?: string | null;
};

export type AdminInquiryRecord = TravelerInquiry & {
  listing: TourListing | null;
  channel: "Email" | "Phone" | "WhatsApp";
};

export type AdminUserRecord = AdminProfileRecord & {
  inquiry_count: number;
  listing_count: number;
  care_profile: TravelerCareProfile | null;
};

export type AdminPromotionRecord = {
  id: string;
  code: string;
  partner: string;
  landingPage: string;
  commissionRate: number;
  usage: number;
  conversions: number;
  status: "Active" | "Paused";
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
};

export type AdminPaymentRecord = WiPayPaymentSummary & {
  traveler_name: string;
  operator_name: string;
  listing_title: string | null;
};

export type AdminWorkspaceData = {
  profile: TravelerProfile;
  listings: TourListing[];
  inquiries: AdminInquiryRecord[];
  users: AdminUserRecord[];
  featuredListings: TourListing[];
  pendingListings: TourListing[];
  recentListings: TourListing[];
  recentBookings: AdminInquiryRecord[];
  recentPayments: AdminPaymentRecord[];
  promotions: AdminPromotionRecord[];
  settings: {
    approvalIntensity: "strict" | "balanced" | "fast";
    notificationMode: "realtime" | "digest";
    moderationWindowHours: number;
    defaultVisibility: "private_until_approved" | "manual" | "public";
    criticalApprovalsEnabled: boolean;
    listingRejectsEnabled: boolean;
    bookingEscalationsEnabled: boolean;
    systemAlertsEnabled: boolean;
  };
  stats: {
    totalUsers: number;
    activeOperators: number;
    liveListings: number;
    pendingListings: number;
    rejectedListings: number;
    confirmedBookings: number;
    pendingBookings: number;
    monthlyRevenue: number;
    adminCommissionTotal: number;
    operatorPayoutTotal: number;
    paymentCount: number;
    profileViews: number;
    countriesCovered: number;
  };
  reports: Array<{ name: string; format: string; status: "Ready" | "Queued" }>;
  trendNotes: string[];
  activityTimeline: Array<{ day: string; count: number }>;
};

function isMissingTableOrRelation(error: DbError) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "42703" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("Could not find the relation") ||
        error.message?.includes("relation") ||
        error.message?.includes("does not exist")),
  );
}

function normalizeListing(listing: TourListing & { image_base64?: string | null }) {
  return {
    ...listing,
    image_url: normalizeMediaSource(listing.image_base64) ?? normalizeMediaSource(listing.image_url),
  } satisfies TourListing;
}

function normalizeProfile(profile: AdminProfileRecord) {
  return {
    ...profile,
    profile_image_url:
      normalizeMediaSource(profile.avatar_base64) ?? normalizeMediaSource(profile.profile_image_url),
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function channelFromInquiry(inquiry: TravelerInquiry) {
  if (inquiry.traveler_phone) {
    return inquiry.availability === "flexible" ? "WhatsApp" : "Phone";
  }

  return "Email";
}

export async function requireAdminProfile() {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile) {
    redirect("/AdminLogin");
  }

  if (profileContext.profile.role !== "admin") {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  return profileContext.profile;
}

async function fetchAllListings() {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("tour_listings")
    .select(
      "id,title,location,country,duration,summary,image_url,image_base64,price,operator_id,operator_name,featured,is_active,status,created_at,updated_at",
    )
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42703" || error.message?.includes("column")) {
      const fallback = await admin
        .from("tour_listings")
        .select(
          "id,title,location,country,duration,summary,image_url,image_base64,price,operator_id,operator_name,featured,is_active,created_at,updated_at",
        )
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });

      if (fallback.error) {
        if (isMissingTableOrRelation(fallback.error)) {
          return [] as TourListing[];
        }

        throw new Error(fallback.error.message);
      }

      return ((fallback.data ?? []) as Array<TourListing & { image_base64?: string | null }>).map((listing) => ({
        ...normalizeListing(listing),
        status: (listing.is_active ? "live" : "under_review") as TourListing["status"],
      }));
    }

    if (isMissingTableOrRelation(error)) {
      return [] as TourListing[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as Array<TourListing & { image_base64?: string | null }>).map((listing) => ({
    ...normalizeListing(listing),
    status: (listing.status ?? (listing.is_active ? "live" : "under_review")) as TourListing["status"],
  }));
}

async function fetchAllInquiries() {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("inquiries")
    .select(
      "id,user_id,listing_id,payment_amount,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableOrRelation(error)) {
      return [] as TravelerInquiry[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as TravelerInquiry[];
}

async function fetchAllProfiles() {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id,email,full_name,preferred_inquiry_area,role,is_active,status_reason,last_seen_at,created_at,updated_at,profile_image_url,avatar_base64",
    )
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableOrRelation(error)) {
      return [] as AdminProfileRecord[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as AdminProfileRecord[]).map(normalizeProfile);
}

export async function getAdminWorkspaceData() {
  const profile = await requireAdminProfile();
  const [listings, inquiries, users] = await Promise.all([
    fetchAllListings(),
    fetchAllInquiries(),
    fetchAllProfiles(),
  ]);
  const [referralCampaigns, settings, platformEvents] = await Promise.all([
    getReferralCampaigns(),
    getAdminWorkspaceSettings(),
    getPlatformEvents(500),
  ]);
  const careProfiles = await getTravelerCareProfiles(
    users.filter((user) => user.role === "traveler").map((user) => user.id),
  );
  const careProfileByUserId = new Map(careProfiles.map((entry) => [entry.user_id, entry]));

  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const inquiryByListingCountry = new Set<string>();
  const listingInquiryCounts = new Map<string, number>();

  const inquiriesWithListing: AdminInquiryRecord[] = inquiries.map((inquiry) => {
    const listing = inquiry.listing_id ? listingById.get(inquiry.listing_id) ?? null : null;

    if (inquiry.destination_country) {
      inquiryByListingCountry.add(inquiry.destination_country);
    }

    if (listing?.country) {
      inquiryByListingCountry.add(listing.country);
    }

    if (inquiry.listing_id) {
      listingInquiryCounts.set(inquiry.listing_id, (listingInquiryCounts.get(inquiry.listing_id) ?? 0) + 1);
    }

    return {
      ...inquiry,
      listing,
      channel: channelFromInquiry(inquiry),
    };
  });

  const usersWithCounts: AdminUserRecord[] = users.map((user) => ({
    ...user,
    inquiry_count: inquiries.filter((item) => item.user_id === user.id).length,
    listing_count: listings.filter((item) => item.operator_id === user.id).length,
    care_profile: careProfileByUserId.get(user.id) ?? null,
  }));

  const featuredListings = [...listings.filter((listing) => listing.featured)].sort(
    (left, right) =>
      (listingInquiryCounts.get(right.id) ?? 0) - (listingInquiryCounts.get(left.id) ?? 0) ||
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
  const promotedListings =
    featuredListings.length > 0
      ? featuredListings.slice(0, 3)
      : [...listings]
          .sort(
            (left, right) =>
              (listingInquiryCounts.get(right.id) ?? 0) - (listingInquiryCounts.get(left.id) ?? 0) ||
              Number(right.is_active) - Number(left.is_active) ||
              new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
          )
          .slice(0, 3);
  const pendingListings = listings.filter((listing) => listing.status === "under_review");
  const recentListings = listings.slice(0, 3);
  const recentBookings = inquiriesWithListing.slice(0, 4);
  const payments = await getWiPayPaymentsForInquiryIds(inquiries.map((inquiry) => inquiry.id)).catch(() => []);
  const recentPayments = payments
    .map((payment) => {
      const inquiry = inquiriesWithListing.find((item) => item.id === payment.inquiry_id) ?? null;
      const listing = inquiry?.listing ?? null;

      return {
        ...payment,
        traveler_name: inquiry?.traveler_name ?? "Traveller",
        operator_name: inquiry?.operator_name ?? listing?.operator_name ?? "Operator",
        listing_title: listing?.title ?? inquiry?.destination ?? null,
      };
    })
    .slice(0, 6);

  const confirmedBookings = inquiriesWithListing.filter((item) => item.status === "confirmed");
  const pendingBookings = inquiriesWithListing.filter((item) => ["submitted", "reviewed"].includes(item.status));
  const activeOperators = usersWithCounts.filter((user) => user.role === "operator" && user.is_active).length;
  const liveListings = listings.filter((listing) => listing.status === "live" || listing.is_active).length;
  const rejectedListings = listings.filter((listing) => listing.status === "rejected").length;
  const monthlyRevenue = sumSuccessfulWiPayPayments(payments);
  const adminCommissionTotal = sumAdminCommission(payments);
  const operatorPayoutTotal = sumOperatorPayout(payments);

  const promotions =
    referralCampaigns.length > 0
      ? referralCampaigns.map((campaign) => ({
          id: campaign.id,
          code: campaign.code,
          partner: campaign.partner_name,
          landingPage: campaign.landing_page,
          commissionRate: Number(campaign.commission_rate),
          usage: campaign.usage_count,
          conversions: campaign.conversion_count,
          status: (campaign.is_active ? "Active" : "Paused") as AdminPromotionRecord["status"],
          utmSource: campaign.utm_source,
          utmMedium: campaign.utm_medium,
          utmCampaign: campaign.utm_campaign,
        }))
      : usersWithCounts
          .filter((user) => user.role === "operator")
          .slice(0, 3)
          .map((user) => ({
            id: user.id,
            code: `TT-${slugify(user.full_name || "operator")}-${String(user.listing_count || user.inquiry_count || 0).padStart(2, "0")}`,
            partner: user.full_name,
            landingPage: "/Enquiry",
            commissionRate: PLATFORM_ADMIN_COMMISSION_RATE * 100,
            usage: user.inquiry_count,
            conversions: Math.max(0, user.inquiry_count - 1),
            status: (user.is_active ? "Active" : "Paused") as AdminPromotionRecord["status"],
            utmSource: slugify(user.full_name || "operator"),
            utmMedium: "referral",
            utmCampaign: `${slugify(user.full_name || "operator")}-launch`,
          }));

  const activityTimeline = buildActivityTimeline(platformEvents);
  const profileViews = platformEvents.filter((event) => event.event_type === "profile_view").length;

  const reports: AdminWorkspaceData["reports"] = [
    {
      name: "Weekly snapshot",
      format: "PDF",
      status: liveListings > 0 ? "Ready" : "Queued",
    },
    {
      name: "Monthly workbook",
      format: "Excel",
      status: confirmedBookings.length > 0 ? "Ready" : "Queued",
    },
    {
      name: "Growth digest",
      format: "PDF",
      status: pendingBookings.length > 0 ? "Ready" : "Queued",
    },
  ];

  const trendNotes = [
    `${pendingBookings.length} booking request${pendingBookings.length === 1 ? "" : "s"} still need admin follow-up.`,
    `${promotedListings.length} listing${promotedListings.length === 1 ? "" : "s"} are currently featured or promoted on the platform.`,
    `${inquiryByListingCountry.size} countr${inquiryByListingCountry.size === 1 ? "y" : "ies"} are represented in current activity.`,
    `${referralCampaigns.filter((campaign) => campaign.is_active).length} active referral campaign${referralCampaigns.filter((campaign) => campaign.is_active).length === 1 ? "" : "s"} are sending traffic.`,
    `${monthlyRevenue > 0 ? `WiPay has processed ${monthlyRevenue.toLocaleString()} in gross confirmed collections, with ${adminCommissionTotal.toLocaleString()} retained as platform commission.` : "WiPay revenue has not posted confirmed collections yet."}`,
  ];

  return {
    profile,
    listings,
    inquiries: inquiriesWithListing,
    users: usersWithCounts,
    featuredListings: promotedListings,
    pendingListings,
    recentListings,
    recentBookings,
    promotions,
    settings: {
      approvalIntensity: settings?.approval_intensity ?? "balanced",
      notificationMode: settings?.notification_mode ?? "realtime",
      moderationWindowHours: settings?.moderation_window_hours ?? 24,
      defaultVisibility: settings?.default_visibility ?? "private_until_approved",
      criticalApprovalsEnabled: settings?.critical_approvals_enabled ?? true,
      listingRejectsEnabled: settings?.listing_rejects_enabled ?? true,
      bookingEscalationsEnabled: settings?.booking_escalations_enabled ?? true,
      systemAlertsEnabled: settings?.system_alerts_enabled ?? true,
    },
    stats: {
      totalUsers: users.length,
      activeOperators,
      liveListings,
      pendingListings: pendingListings.length,
      rejectedListings,
      confirmedBookings: confirmedBookings.length,
      pendingBookings: pendingBookings.length,
      monthlyRevenue,
      adminCommissionTotal,
      operatorPayoutTotal,
      paymentCount: payments.filter((payment) => isSuccessfulWiPayPayment(payment.status)).length,
      profileViews,
      countriesCovered: inquiryByListingCountry.size,
    },
    reports,
    trendNotes,
    activityTimeline,
    recentPayments,
  } satisfies AdminWorkspaceData;
}

function buildActivityTimeline(
  events: Awaited<ReturnType<typeof getPlatformEvents>>,
): Array<{ day: string; count: number }> {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const buckets = new Map<string, number>();

  days.forEach((date) => {
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, 0);
  });

  events.forEach((event) => {
    const dateKey = new Date(event.created_at).toISOString().slice(0, 10);
    if (buckets.has(dateKey)) {
      buckets.set(dateKey, (buckets.get(dateKey) ?? 0) + 1);
    }
  });

  return days.map((date) => {
    const key = date.toISOString().slice(0, 10);
    return {
      day: formatDate(date),
      count: buckets.get(key) ?? 0,
    };
  });
}
