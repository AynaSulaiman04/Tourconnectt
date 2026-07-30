import "server-only";

import { unstable_cache } from "next/cache";
import { toBritishUserCopy } from "@/lib/copy/british-english";
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
  heroEyebrow: string;
  heroPrefix: string;
  heroPhrases: string;
  heroDescription: string;
  slideshowIntervalMs: number;
  heroRotationMs: number;
  notificationPollSeconds: number;
};

export const DEFAULT_SITE_CONTENT: SiteContent = {
  footerDescription: "Curated journeys, exclusive access, and travel inspiration.",
  howItWorks:
    "Browse experiences, send an enquiry to the local operator, confirm the details together, and complete payment when your itinerary is ready.",
  aboutUs:
    "Tour ConnecTT connects travellers with trusted Caribbean tour operators through a personal, enquiry-first booking experience.",
  partners:
    "We work with local tour operators, destination specialists, and hospitality partners who care about authentic, well-supported travel.",
  careers:
    "We are building a more connected Caribbean travel experience. Send us a note if you would like to contribute to the mission.",
  helpCenter:
    "For help with an enquiry, booking, payment, profile, or accessibility requirement, contact our team and include the email used for your account.",
  contactUs:
    "Tell us where you are travelling, what support you need, and the best way to reach you. Our team will help route your request.",
  contactEmail: "support@tourconnectt.com",
  heroEyebrow: "Curated journeys. Meaningful connections.",
  heroPrefix: "Extraordinary places.",
  heroPhrases:
    "Curated for you.\nHandpicked for you.\nDesigned around you.\nConnected with care.\nCrafted for arrival.",
  heroDescription: "Bespoke itineraries, handpicked stays, and seamless experiences crafted around you.",
  slideshowIntervalMs: 2000,
  heroRotationMs: 2000,
  notificationPollSeconds: 120,
};

function normalizeSiteContent(value: unknown): SiteContent {
  const candidate = value && typeof value === "object" ? (value as Partial<SiteContent>) : {};
  const content = { ...DEFAULT_SITE_CONTENT };

  for (const key of Object.keys(content) as Array<keyof SiteContent>) {
    const nextValue = candidate[key];
    if (key === "slideshowIntervalMs" || key === "heroRotationMs" || key === "notificationPollSeconds") {
      const parsed = Number(nextValue);
      if (Number.isFinite(parsed) && parsed > 0) {
        content[key] = parsed;
      }
      continue;
    }

    if (typeof nextValue === "string" && nextValue.trim()) {
      content[key] = toBritishUserCopy(nextValue.trim());
    }
  }

  content.slideshowIntervalMs = Math.min(Math.max(content.slideshowIntervalMs, 1500), 15000);
  content.heroRotationMs = Math.min(Math.max(content.heroRotationMs, 1500), 15000);
  content.notificationPollSeconds = Math.min(Math.max(content.notificationPollSeconds, 15), 600);

  return content;
}

async function fetchSiteContent() {
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

export const getSiteContent = unstable_cache(fetchSiteContent, ["site-content"], {
  revalidate: 300,
  tags: ["site-content"],
});
