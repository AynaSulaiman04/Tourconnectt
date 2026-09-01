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
  footerDescription: "Trinidad and Tobago experiences, run by local operators, arranged through one conversation.",
  howItWorks: "Tour ConnecTT is enquiry-first. Nothing is booked out from under you, and no operator takes your money before the details are agreed.\n\n1. Tell us the trip.\nDescribe it in plain English on the home page, or open Concierge and talk it through. You do not need an account to start. Concierge reads our live listings and builds a day-by-day draft you can keep refining - cheaper, longer, more rainforest, less driving.\n\n2. Send an enquiry.\nWhen a listing looks right, send an enquiry to the operator who runs it. Include your dates, group size, and anything that affects the day: a nervous swimmer, a wheelchair, a dietary requirement, a 9am flight out.\n\n3. The operator replies.\nA real local operator reviews your dates and confirms what is actually possible. You will hear back through the messages area and by email. If something cannot work, they will say so and suggest an alternative.\n\n4. Confirm and pay.\nOnce the booking is confirmed and the amount is set, you pay by card through WiPay in Trinidad and Tobago dollars. Payment happens only after confirmation, never before.\n\n5. Travel.\nYour booking, documents, and operator messages stay in your traveller dashboard. You get reminders before the trip and pre-tour instructions from the operator.",
  aboutUs: "Tour ConnecTT connects travellers with the people who actually run experiences in Trinidad and Tobago.\n\nMost booking platforms sell a ticket and disappear. That works for a museum entry. It works badly for a leatherback nesting watch that depends on the season, a catamaran day that depends on the sea, or a rainforest hike where somebody in the group cannot manage steep ground.\n\nSo we built the opposite. Every experience on Tour ConnecTT belongs to a named local operator, and every trip starts as a conversation with them. They confirm what is possible before any money moves. When conditions change, you are talking to the person who knows.\n\nWhat that means in practice:\n\nOperators are real and accountable. Each listing shows who runs it. Operators manage their own availability, pricing, and customer records, and are reviewed by our team before going live.\n\nPrices are the operator's own. We do not mark listings up behind your back. Our commission is a stated share of the booking, and the operator keeps the rest.\n\nAccess needs are part of the booking, not an afterthought. Mobility, dietary, and medical notes travel with your enquiry so the operator can plan properly, or tell you honestly that a particular day will not suit.\n\nLocal knowledge is the product. Our Concierge assistant answers from our operators' real listings and from guidance written about these islands - seasons, ferries, Carnival, pepper on the side - not from generic travel copy.\n\nWe are a Trinidad and Tobago company building for Trinidad and Tobago tourism.",
  partners: "We work with the operators, guides, and hospitality businesses who make these islands worth the trip.\n\nFor tour operators.\nList your experiences, manage your own availability and pricing, keep your customer records and documents in one place, and get paid by card through WiPay. You keep 80% of every booking; our commission is the remaining 20%, stated up front with no hidden markup on your prices. Connect Google Calendar and confirmed bookings sync automatically, with conflict checks so you are never double-booked.\n\nOperator accounts are invite-only and reviewed before listings go live. That is deliberate - it is what lets us tell travellers the operators here are real.\n\nFor accommodation and transport.\nGuesthouses, boutique hotels, drivers, and charter operators: travellers routinely ask our Concierge about stays and transfers alongside activities. If you want to be part of those itineraries, get in touch.\n\nFor destination and community partners.\nWe work with conservation groups, heritage sites, and community tourism projects - including seasonal and permit-based experiences such as turtle nesting - where responsible visitor numbers matter more than volume.\n\nFor referral partners.\nAirlines, agencies, publishers, and creators can drive traffic through tracked referral campaigns with a stated commission rate and reporting on conversions.\n\nTo start a conversation, contact our team with what you run and where.",
  careers: "We are a small team building the booking layer for Trinidad and Tobago tourism.\n\nThe work is unglamorous and specific: making an enquiry reach the right operator, making a payment reconcile correctly, making an accessibility note actually reach the guide before the boat leaves. If that sounds like the interesting part rather than the boring part, we should talk.\n\nWhat we tend to need:\n\nEngineering. TypeScript, Next.js, Postgres. You will work close to real operator and traveller workflows, not three layers of abstraction away from them.\n\nOperator success. Onboarding operators, reviewing listings, and helping small businesses present their experiences well. Requires patience and real knowledge of the local tourism trade.\n\nContent and local expertise. Writing the destination guidance our Concierge answers from. Seasons, transport, food, etiquette, access - the things a good local friend would tell you.\n\nWe hire for judgement and care over credentials. Experience in Caribbean tourism, hospitality, or guiding counts for as much as a technical background in several of these roles.\n\nThere may not be an open posting for what you do. Send a note anyway, tell us what you would want to fix here, and we will keep it on file.",
  helpCenter: "Most questions fall into one of these.\n\nMy enquiry has had no reply.\nOperators are small businesses and usually reply within a day or two. Check the messages area in your dashboard as well as your email, including spam. If it has been longer than that, contact us with the email address on your account and we will chase the operator.\n\nI want to change dates or group size.\nReply in the message thread for that booking. Do not send a second enquiry - it creates a duplicate the operator has to untangle. If the booking is already confirmed and paid, tell us as well so we can help sort the payment.\n\nPayment is not working.\nPayment only becomes available after an operator confirms your booking and an amount is set. If your booking shows as confirmed but there is no payment option, the amount has not been set yet and we will sort it. If a card is declined, that is between your bank and WiPay; try another card or contact your bank.\n\nI have paid but nothing has updated.\nCard payments occasionally confirm slower than the page refreshes. Reload your payments tab. If it still shows unpaid after ten minutes, contact us with the booking and the approximate time you paid - do not pay twice.\n\nI need to cancel.\nCancellation and refunds are the operator's own terms, since it is their experience and their costs. Ask them directly in the message thread. If you cannot reach them, contact us.\n\nAccessibility, dietary, or medical needs.\nPut these in the private details section of your traveller profile and in your enquiry. They travel with the booking to the operator. If you are unsure whether an experience will suit, ask before booking - operators would much rather tell you honestly in advance.\n\nI am an operator and need help.\nOperator questions about listings, moderation, payouts, calendar sync, or documents go to the same address. Say that you are an operator so we route it correctly.\n\nWhen you contact us, include the email address on your account and the booking reference if you have one. It roughly halves how long everything takes.",
  contactUs: "Tell us what you need and we will route it to the right place.\n\nTravellers: include the email address on your account, the booking if there is one, and your travel dates. If it is about a payment, tell us roughly when you paid rather than paying again.\n\nOperators: say that you are an operator. Listing reviews, payouts, calendar sync, and document questions all come to the same address.\n\nProspective partners: tell us what you run and where. Operators, accommodation, transport, conservation and community projects, and referral partners are all welcome.\n\nPress and general enquiries are welcome at the same address.\n\nWe are based in Trinidad and Tobago and answer during local business hours, Monday to Friday. Urgent day-of-travel problems are best raised directly with your operator in the message thread - they are the ones who can act on the day.",
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
