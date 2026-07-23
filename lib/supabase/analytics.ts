import "server-only";

import { createSupabaseServiceRoleClient } from "./server";

export type PlatformEventType =
  | "profile_view"
  | "inquiry_submitted"
  | "inquiry_reviewed"
  | "inquiry_confirmed"
  | "inquiry_closed"
  | "listing_approved"
  | "listing_rejected"
  | "listing_featured"
  | "document_uploaded"
  | "document_shared"
  | "user_status_changed"
  | "admin_profile_updated"
  | "admin_settings_updated"
  | "referral_click"
  | "referral_conversion";

export type PlatformEventRecord = {
  id: string;
  event_type: PlatformEventType;
  actor_profile_id: string | null;
  actor_role: string | null;
  target_profile_id: string | null;
  listing_id: string | null;
  inquiry_id: string | null;
  document_id: string | null;
  referral_campaign_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ReferralCampaignRecord = {
  id: string;
  code: string;
  partner_name: string;
  landing_page: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  commission_rate: number;
  usage_count: number;
  conversion_count: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AdminWorkspaceSettings = {
  id: number;
  approval_intensity: "strict" | "balanced" | "fast";
  notification_mode: "realtime" | "digest";
  moderation_window_hours: number;
  default_visibility: "private_until_approved" | "manual" | "public";
  critical_approvals_enabled: boolean;
  listing_rejects_enabled: boolean;
  booking_escalations_enabled: boolean;
  system_alerts_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type LandingSlideshowImage = {
  name: string;
  path: string;
  publicUrl: string;
  createdAt: string | null;
};

const LANDING_SLIDESHOW_BUCKET = "landing-slideshow";
const LANDING_SLIDESHOW_PREFIX = "admin";

function isMissingRelationOrColumnError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "42703" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("Could not find the relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

export type PlatformEventInput = {
  event_type: PlatformEventType;
  actor_profile_id?: string | null;
  actor_role?: string | null;
  target_profile_id?: string | null;
  listing_id?: string | null;
  inquiry_id?: string | null;
  document_id?: string | null;
  referral_campaign_id?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordPlatformEvent(payload: PlatformEventInput) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("platform_events").insert({
    ...payload,
    metadata: payload.metadata ?? {},
  });

  if (error && !isMissingRelationOrColumnError(error)) {
    throw new Error(error.message);
  }
}

export async function getReferralCampaigns() {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("referral_campaigns")
    .select(
      "id,code,partner_name,landing_page,utm_source,utm_medium,utm_campaign,commission_rate,usage_count,conversion_count,is_active,metadata,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationOrColumnError(error)) {
      return [] as ReferralCampaignRecord[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as ReferralCampaignRecord[];
}

export async function getReferralCampaignByCode(code: string) {
  const normalizedCode = code.trim();

  if (!normalizedCode) {
    return null;
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("referral_campaigns")
    .select(
      "id,code,partner_name,landing_page,utm_source,utm_medium,utm_campaign,commission_rate,usage_count,conversion_count,is_active,metadata,created_at,updated_at",
    )
    .ilike("code", normalizedCode)
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrColumnError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (data as ReferralCampaignRecord | null) ?? null;
}

export async function getAdminWorkspaceSettings() {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("admin_workspace_settings")
    .select(
      "id,approval_intensity,notification_mode,moderation_window_hours,default_visibility,critical_approvals_enabled,listing_rejects_enabled,booking_escalations_enabled,system_alerts_enabled,created_at,updated_at",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrColumnError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (data as AdminWorkspaceSettings | null) ?? null;
}

export async function getLandingSlideshowImages() {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.storage.from(LANDING_SLIDESHOW_BUCKET).list(LANDING_SLIDESHOW_PREFIX, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    return [] as LandingSlideshowImage[];
  }

  return (data ?? [])
    .filter((item) => {
      if (typeof item.name !== "string" || !/\.(avif|jpe?g|png|webp)$/i.test(item.name)) {
        return false;
      }

      // The client requested that the originally supplied sunrise image be removed.
      return !item.name.includes("02_12_05-AM-8-") && !item.name.includes("02_12_05_AM_8_");
    })
    .map((item) => ({
      name: item.name,
      path: `${LANDING_SLIDESHOW_PREFIX}/${item.name}`,
      publicUrl: admin.storage.from(LANDING_SLIDESHOW_BUCKET).getPublicUrl(`${LANDING_SLIDESHOW_PREFIX}/${item.name}`).data.publicUrl,
      createdAt: item.created_at ?? null,
    }));
}

export async function getLandingSlideshowImageUrls() {
  const images = await getLandingSlideshowImages();
  return images.map((image) => image.publicUrl);
}

export async function getPlatformEvents(limit = 250) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("platform_events")
    .select(
      "id,event_type,actor_profile_id,actor_role,target_profile_id,listing_id,inquiry_id,document_id,referral_campaign_id,metadata,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelationOrColumnError(error)) {
      return [] as PlatformEventRecord[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as PlatformEventRecord[];
}
