"use server";

import { cookies } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { clearPortalAuthCookie } from "@/lib/supabase/portal-auth";
import { requireAdminProfile } from "@/lib/supabase/admin";
import { getAdminWorkspaceSettings, recordPlatformEvent } from "@/lib/supabase/analytics";

const ADMIN_SETTINGS_REDIRECT = "/AdminSettings";
const LANDING_SLIDESHOW_BUCKET = "landing-slideshow";
const LANDING_SLIDESHOW_PREFIX = "admin/";

type WorkspaceSettingsPayload = {
  approval_intensity: "strict" | "balanced" | "fast";
  notification_mode: "realtime" | "digest";
  moderation_window_hours: number;
  default_visibility: "private_until_approved" | "manual" | "public";
  critical_approvals_enabled: boolean;
  listing_rejects_enabled: boolean;
  booking_escalations_enabled: boolean;
  system_alerts_enabled: boolean;
};

async function saveAdminWorkspaceSettings(
  profileId: string,
  payload: Partial<WorkspaceSettingsPayload>,
  metadata: Record<string, unknown>,
) {
  const existingSettings = await getAdminWorkspaceSettings();
  const mergedPayload: WorkspaceSettingsPayload = {
    approval_intensity: existingSettings?.approval_intensity ?? "balanced",
    notification_mode: existingSettings?.notification_mode ?? "realtime",
    moderation_window_hours: existingSettings?.moderation_window_hours ?? 24,
    default_visibility: existingSettings?.default_visibility ?? "private_until_approved",
    critical_approvals_enabled: existingSettings?.critical_approvals_enabled ?? true,
    listing_rejects_enabled: existingSettings?.listing_rejects_enabled ?? true,
    booking_escalations_enabled: existingSettings?.booking_escalations_enabled ?? true,
    system_alerts_enabled: existingSettings?.system_alerts_enabled ?? true,
    ...payload,
  };

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("admin_workspace_settings").upsert(
    {
      id: 1,
      ...mergedPayload,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("Unable to save admin workspace settings", {
      profileId,
      error: error.message,
      payload: mergedPayload,
    });
    redirect(`${ADMIN_SETTINGS_REDIRECT}?error=admin-settings-save-failed`);
  }

  await recordPlatformEvent({
    event_type: "admin_settings_updated",
    actor_profile_id: profileId,
    actor_role: "admin",
    target_profile_id: profileId,
    metadata,
  });

  revalidatePath("/AdminSettings");
  revalidatePath("/AdminDashboard");
  revalidatePath("/AdminAnalytics");
  revalidateTag("site-content", "max");
}

export async function updateAdminProfileAction(formData: FormData) {
  const profile = await requireAdminProfile();
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!fullName) {
    redirect("/AdminSettings?error=missing-name");
  }

  const admin = createSupabaseServiceRoleClient();

  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", profile.id);

  if (profileError) {
    console.error("Unable to update admin profile", {
      profileId: profile.id,
      error: profileError.message,
    });
    redirect("/AdminSettings?error=admin-profile-save-failed");
  }

  await recordPlatformEvent({
    event_type: "admin_profile_updated",
    actor_profile_id: profile.id,
    actor_role: "admin",
    target_profile_id: profile.id,
    metadata: { full_name: fullName },
  });

  const { error: authError } = await admin.auth.admin.updateUserById(profile.id, {
    user_metadata: {
      ...(profile as { user_metadata?: Record<string, unknown> }).user_metadata,
      full_name: fullName,
      role: "admin",
    },
  });

  if (authError) {
    console.error("Unable to update admin auth metadata", {
      profileId: profile.id,
      error: authError.message,
    });
    redirect("/AdminSettings?error=admin-profile-save-failed");
  }

  revalidatePath("/AdminSettings");
  revalidatePath("/AdminDashboard");
  redirect("/AdminSettings?saved=1");
}

export async function updateAdminWorkspaceSettingsAction(formData: FormData) {
  const profile = await requireAdminProfile();
  const approvalIntensity = String(formData.get("approval_intensity") ?? "").trim();
  const notificationMode = String(formData.get("notification_mode") ?? "").trim();
  const moderationWindowHours = Number.parseInt(String(formData.get("moderation_window_hours") ?? ""), 10);
  const defaultVisibility = String(formData.get("default_visibility") ?? "").trim();
  const criticalApprovalsEnabled = String(formData.get("critical_approvals_enabled") ?? "false") === "true";
  const listingRejectsEnabled = String(formData.get("listing_rejects_enabled") ?? "false") === "true";
  const bookingEscalationsEnabled = String(formData.get("booking_escalations_enabled") ?? "false") === "true";
  const systemAlertsEnabled = String(formData.get("system_alerts_enabled") ?? "false") === "true";

  if (!["strict", "balanced", "fast"].includes(approvalIntensity)) {
    redirect("/AdminSettings?error=invalid-approval");
  }

  if (!["realtime", "digest"].includes(notificationMode)) {
    redirect("/AdminSettings?error=invalid-notification");
  }

  if (!Number.isFinite(moderationWindowHours) || moderationWindowHours < 1 || moderationWindowHours > 168) {
    redirect("/AdminSettings?error=invalid-window");
  }

  if (!["private_until_approved", "manual", "public"].includes(defaultVisibility)) {
    redirect("/AdminSettings?error=invalid-visibility");
  }

  await saveAdminWorkspaceSettings(
    profile.id,
    {
      approval_intensity: approvalIntensity as WorkspaceSettingsPayload["approval_intensity"],
      notification_mode: notificationMode as WorkspaceSettingsPayload["notification_mode"],
      moderation_window_hours: moderationWindowHours,
      default_visibility: defaultVisibility as WorkspaceSettingsPayload["default_visibility"],
      critical_approvals_enabled: criticalApprovalsEnabled,
      listing_rejects_enabled: listingRejectsEnabled,
      booking_escalations_enabled: bookingEscalationsEnabled,
      system_alerts_enabled: systemAlertsEnabled,
    },
    {
      section: "workspace_settings",
      approvalIntensity,
      notificationMode,
      moderationWindowHours,
      defaultVisibility,
      criticalApprovalsEnabled,
      listingRejectsEnabled,
      bookingEscalationsEnabled,
      systemAlertsEnabled,
    },
  );

  redirect(`${ADMIN_SETTINGS_REDIRECT}?saved=1`);
}

export async function toggleAdminWorkspaceAlertAction(formData: FormData) {
  const profile = await requireAdminProfile();
  const settingName = String(formData.get("setting_name") ?? "").trim();
  const nextValue = String(formData.get("next_value") ?? "").trim() === "true";
  const allowedSettings = new Set<keyof WorkspaceSettingsPayload>([
    "critical_approvals_enabled",
    "listing_rejects_enabled",
    "booking_escalations_enabled",
    "system_alerts_enabled",
  ]);

  if (!allowedSettings.has(settingName as keyof WorkspaceSettingsPayload)) {
    redirect(`${ADMIN_SETTINGS_REDIRECT}?error=invalid-notification-toggle`);
  }

  await saveAdminWorkspaceSettings(
    profile.id,
    {
      [settingName]: nextValue,
    } as Partial<WorkspaceSettingsPayload>,
    {
      section: "notification_routing",
      settingName,
      enabled: nextValue,
    },
  );

  redirect(`${ADMIN_SETTINGS_REDIRECT}?saved=1`);
}

export async function deleteLandingSlideshowImageAction(formData: FormData) {
  const profile = await requireAdminProfile();
  const imagePath = String(formData.get("image_path") ?? "").trim();

  if (!imagePath || !imagePath.startsWith(LANDING_SLIDESHOW_PREFIX)) {
    redirect(`${ADMIN_SETTINGS_REDIRECT}?error=invalid-slideshow-image`);
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.storage.from(LANDING_SLIDESHOW_BUCKET).remove([imagePath]);

  if (error) {
    console.error("Unable to delete landing slideshow image", {
      profileId: profile.id,
      imagePath,
      error: error.message,
    });
    redirect(`${ADMIN_SETTINGS_REDIRECT}?error=slideshow-image-delete-failed`);
  }

  await recordPlatformEvent({
    event_type: "admin_settings_updated",
    actor_profile_id: profile.id,
    actor_role: "admin",
    target_profile_id: profile.id,
    metadata: {
      section: "landing_slideshow",
      action: "delete_image",
      imagePath,
    },
  });

  revalidatePath("/LandingPage");
  revalidatePath("/AdminSettings");
  revalidateTag("landing-slideshow", "max");
  redirect(`${ADMIN_SETTINGS_REDIRECT}?saved=1`);
}

export async function signOutAdminAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  await clearPortalAuthCookie(await cookies());
  redirect("/LoginPage?auth=logged_out");
}
