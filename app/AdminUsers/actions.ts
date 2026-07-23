"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAdminProfile } from "@/lib/supabase/admin";
import { getRoleDashboardRoute } from "@/lib/supabase/profile";
import { recordPlatformEvent } from "@/lib/supabase/analytics";
import { recordAdminNotifications, recordPlatformNotification } from "@/lib/supabase/notifications";
import { parseTravelerCareFormData, upsertTravelerCareProfile } from "@/lib/supabase/traveler-care";

function getReturnTo(formData: FormData) {
  const value = String(formData.get("return_to") ?? "").trim();
  return value || "/AdminUsers";
}

function buildRedirectUrl(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export async function updateUserAccessAction(formData: FormData) {
  const currentProfile = await requireAdminProfile();
  const targetId = String(formData.get("profile_id") ?? "").trim();
  const returnTo = getReturnTo(formData);

  if (!targetId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-profile" }));
  }

  const admin = createSupabaseServiceRoleClient();
  const patch: Record<string, string | boolean | null> = {};
  const { data: targetProfile } = await admin.from("profiles").select("full_name,role").eq("id", targetId).maybeSingle();

  const nextAccountStatus = String(formData.get("account_status") ?? "").trim();
  const accountStatusValue =
    nextAccountStatus === "active" ||
    nextAccountStatus === "suspended" ||
    nextAccountStatus === "restricted" ||
    nextAccountStatus === "under_review"
      ? nextAccountStatus
      : "";

  if (accountStatusValue) {
    patch.is_active = accountStatusValue === "active";
    patch.status_reason =
      accountStatusValue === "active"
        ? null
        : accountStatusValue === "suspended"
          ? "Suspended by admin"
          : accountStatusValue === "restricted"
            ? "Restricted by admin"
            : "Under review";
  }

  const nextIsActive = formData.get("is_active");
  if (!accountStatusValue && nextIsActive !== null) {
    const normalized = String(nextIsActive).trim().toLowerCase();
    patch.is_active = normalized !== "false" && normalized !== "0" && normalized !== "";
    patch.status_reason = patch.is_active ? null : "Suspended from admin panel";
  }

  const nextRole = String(formData.get("role") ?? "").trim();
  if (["traveler", "operator", "admin"].includes(nextRole)) {
    patch.role = nextRole;
  }

  if (targetId === currentProfile.id && ((patch.role && patch.role !== "admin") || patch.is_active === false)) {
    redirect(buildRedirectUrl(returnTo, { error: "cannot-demote-self" }));
  }

  if (Object.keys(patch).length === 0) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-changes" }));
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", targetId);

  if (error) {
    console.error("Unable to update admin user access", { targetId, patch, error: error.message });
    redirect(buildRedirectUrl(returnTo, { error: "We could not update that user. Please try again." }));
  }

  await recordPlatformEvent({
    event_type: "user_status_changed",
    actor_profile_id: currentProfile.id,
    actor_role: "admin",
    target_profile_id: targetId,
    metadata: {
      ...patch,
    },
  });

  await recordAdminNotifications({
    actorProfileId: currentProfile.id,
    excludeProfileId: currentProfile.id,
    kind: "user_status_changed",
    title: accountStatusValue
      ? accountStatusValue === "active"
        ? "User reactivated"
        : accountStatusValue === "suspended"
          ? "User suspended"
          : accountStatusValue === "restricted"
            ? "User restricted"
            : "User placed under review"
      : nextIsActive === null
        ? "User profile updated"
        : nextIsActive
          ? "User reactivated"
          : "User suspended",
    body:
      accountStatusValue
        ? accountStatusValue === "active"
          ? "A restricted or suspended account was reactivated."
          : accountStatusValue === "suspended"
            ? "An account was suspended."
            : accountStatusValue === "restricted"
              ? "An account was restricted."
              : "An account was placed under review."
        : nextIsActive === null
          ? "A platform profile was updated."
          : nextIsActive
            ? "A suspended account was reactivated."
            : "An account was suspended.",
    href: `/AdminUsers?user=${targetId}`,
    entityType: "profile",
    entityId: targetId,
    metadata: {
      ...patch,
    },
  }).catch((notificationError) => {
    console.error("Unable to record admin user notification", {
      targetId,
      error: notificationError,
    });
  });

  if (targetProfile) {
    await recordPlatformNotification({
      recipientProfileId: targetId,
      actorProfileId: currentProfile.id,
      kind: "user_status_changed",
      title:
        accountStatusValue
          ? accountStatusValue === "active"
            ? "Account reactivated"
            : accountStatusValue === "suspended"
              ? "Account suspended"
              : accountStatusValue === "restricted"
                ? "Account restricted"
                : "Account under review"
          : nextIsActive === null
            ? "Profile updated"
            : nextIsActive
              ? "Account reactivated"
              : "Account suspended",
      body:
        accountStatusValue
          ? accountStatusValue === "active"
            ? "Your account is active again."
            : accountStatusValue === "suspended"
              ? "Your account has been suspended by an admin."
              : accountStatusValue === "restricted"
                ? "Your account has been restricted by an admin."
                : "Your account is under review."
          : nextIsActive === null
            ? "Your profile was updated by an admin."
            : nextIsActive
              ? "Your account is active again."
              : "Your account has been suspended by an admin.",
      href: getRoleDashboardRoute((targetProfile.role as string | null | undefined) ?? "traveler"),
      entityType: "profile",
      entityId: targetId,
      metadata: {
        ...patch,
      },
    }).catch((notificationError) => {
      console.error("Unable to record target user notification", {
        targetId,
        error: notificationError,
      });
    });
  }

  revalidatePath("/AdminDashboard");
  revalidatePath("/AdminUsers");
  revalidatePath("/AdminAnalytics");
  redirect(buildRedirectUrl(returnTo, { updated: "1" }));
}

export async function updateTravelerCareProfileAction(formData: FormData) {
  await requireAdminProfile();
  const targetId = String(formData.get("profile_id") ?? "").trim();
  const returnTo = getReturnTo(formData);

  if (!targetId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-profile" }));
  }

  const validated = parseTravelerCareFormData(formData);
  if (!validated.success) {
    redirect(buildRedirectUrl(returnTo, { error: "Please review the guest care fields and try again." }));
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", targetId).maybeSingle();
  if (!target || target.role !== "traveler") {
    redirect(buildRedirectUrl(returnTo, { error: "Guest care information can only be saved for travelers." }));
  }

  try {
    await upsertTravelerCareProfile(targetId, validated.data);
  } catch (error) {
    console.error("Unable to update traveler care profile", { targetId, error });
    redirect(buildRedirectUrl(returnTo, { error: "We could not save the guest care information." }));
  }

  revalidatePath("/AdminUsers");
  revalidatePath("/TravellerProfile");
  revalidatePath("/OperatorUserManage");
  redirect(buildRedirectUrl(returnTo, { updated: "care" }));
}
