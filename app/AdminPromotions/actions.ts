"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/supabase/admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function getReturnTo(formData: FormData) {
  const value = String(formData.get("return_to") ?? "").trim();
  return value || "/AdminPromotions";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildRedirectUrl(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export async function createReferralCampaignAction(formData: FormData) {
  const adminProfile = await requireAdminProfile();
  const returnTo = getReturnTo(formData);
  const partnerName = String(formData.get("partner_name") ?? "").trim();
  const codeInput = String(formData.get("code") ?? "").trim();
  const landingPage = String(formData.get("landing_page") ?? "/Enquiry").trim() || "/Enquiry";
  const utmSource = String(formData.get("utm_source") ?? "").trim();
  const utmMedium = String(formData.get("utm_medium") ?? "referral").trim() || "referral";
  const utmCampaign = String(formData.get("utm_campaign") ?? "").trim();
  const commissionRate = Number.parseFloat(String(formData.get("commission_rate") ?? "12.5"));

  if (!partnerName || !utmSource || !utmCampaign || !Number.isFinite(commissionRate)) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-campaign-data" }));
  }

  const admin = createSupabaseServiceRoleClient();
  const code = codeInput || `TT-${slugify(partnerName)}-${Math.floor(Date.now() / 1000)}`;

  const { error } = await admin.from("referral_campaigns").insert({
    code,
    partner_name: partnerName,
    landing_page: landingPage,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    commission_rate: commissionRate,
    metadata: {
      created_by: adminProfile.id,
    },
  });

  if (error) {
    console.error("Unable to create referral campaign", { partnerName, code, error: error.message });
    redirect(buildRedirectUrl(returnTo, { error: "We could not create that promotion. Please try again." }));
  }

  revalidatePath("/AdminPromotions");
  revalidatePath("/AdminAnalytics");
  redirect(buildRedirectUrl(returnTo, { created: "1" }));
}

export async function toggleReferralCampaignAction(formData: FormData) {
  await requireAdminProfile();

  const campaignId = String(formData.get("campaign_id") ?? "").trim();
  const returnTo = getReturnTo(formData);
  const nextStatus = String(formData.get("is_active") ?? "").trim().toLowerCase();

  if (!campaignId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-campaign" }));
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("referral_campaigns")
    .update({ is_active: nextStatus !== "false" && nextStatus !== "0" })
    .eq("id", campaignId);

  if (error) {
    console.error("Unable to update referral campaign", { campaignId, error: error.message });
    redirect(buildRedirectUrl(returnTo, { error: "We could not update that promotion. Please try again." }));
  }

  revalidatePath("/AdminPromotions");
  revalidatePath("/AdminAnalytics");
  redirect(buildRedirectUrl(returnTo, { updated: "1" }));
}
