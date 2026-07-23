import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type SiteContent = {
  footerDescription: string;
  howItWorks: string;
  aboutUs: string;
  partners: string;
  careers: string;
  helpCenter: string;
  contactUs: string;
  contactEmail: string;
};

export const DEFAULT_SITE_CONTENT: SiteContent = {
  footerDescription: "Curated journeys, exclusive access, and travel inspiration.",
  howItWorks:
    "Browse experiences, send an inquiry to the local operator, confirm the details together, and complete payment when your itinerary is ready.",
  aboutUs:
    "Tour ConnecTT connects travelers with trusted Caribbean tour operators through a personal, inquiry-first booking experience.",
  partners:
    "We work with local tour operators, destination specialists, and hospitality partners who care about authentic, well-supported travel.",
  careers:
    "We are building a more connected Caribbean travel experience. Send us a note if you would like to contribute to the mission.",
  helpCenter:
    "For help with an inquiry, booking, payment, profile, or accessibility requirement, contact our team and include the email used for your account.",
  contactUs:
    "Tell us where you are traveling, what support you need, and the best way to reach you. Our team will help route your request.",
  contactEmail: "support@tourconnectt.com",
};

function normalizeSiteContent(value: unknown): SiteContent {
  const candidate = value && typeof value === "object" ? (value as Partial<SiteContent>) : {};
  const content = { ...DEFAULT_SITE_CONTENT };

  for (const key of Object.keys(content) as Array<keyof SiteContent>) {
    const nextValue = candidate[key];
    if (typeof nextValue === "string" && nextValue.trim()) {
      content[key] = nextValue.trim();
    }
  }

  return content;
}

export async function getSiteContent() {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin
      .from("admin_workspace_settings")
      .select("site_content")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      return DEFAULT_SITE_CONTENT;
    }

    return normalizeSiteContent(data?.site_content);
  } catch {
    return DEFAULT_SITE_CONTENT;
  }
}
