"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireOperatorProfile } from "@/lib/supabase/operator";

function getReturnTo(formData: FormData) {
  const value = String(formData.get("return_to") ?? "").trim();
  return value || "/OperatorUserManage";
}

function buildRedirectUrl(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export async function updateUserAccessAction(formData: FormData) {
  const currentProfile = await requireOperatorProfile();
  const targetId = String(formData.get("profile_id") ?? "").trim();
  const nextIsActive = String(formData.get("is_active") ?? "").trim() === "true";
  const returnTo = getReturnTo(formData);

  if (!targetId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-user" }));
  }

  if (targetId === currentProfile.id && !nextIsActive) {
    redirect(buildRedirectUrl(returnTo, { error: "self-suspend" }));
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("profiles")
    .update({
      is_active: nextIsActive,
      status_reason: nextIsActive ? null : "Suspended from operator workspace",
    })
    .eq("id", targetId);

  if (error) {
    console.error("Unable to update operator user access", { targetId, error: error.message });
    redirect(buildRedirectUrl(returnTo, { error: "We could not update that user. Please try again." }));
  }

  revalidatePath("/OperatorUserManage");
  revalidatePath("/LoginPage");
  redirect(buildRedirectUrl(returnTo, { updated: "1" }));
}
