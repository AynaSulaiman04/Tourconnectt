import "server-only";

import { normalizeMediaSource } from "@/lib/supabase/media";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { TourListing, TravelerInquiry } from "@/lib/supabase/inquiry-types";
import {
  expandQueryWithTripIntent,
  formatTripIntentPromptBlock,
  formatTripIntentSummary,
  parseTripIntent,
  parseTripIntentFromConversation,
  type TripIntent,
} from "@/lib/ai/trip-intent";

type KnowledgeSourceRow = {
  id: string;
  source_type: string;
  title: string;
  content: string;
  url: string | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type TravelerProfileRow = {
  id: string;
  email: string;
  full_name: string;
  preferred_inquiry_area: "desert" | "coastal" | "arctic" | null;
  role: "traveler" | "operator" | "admin";
  created_at: string;
  updated_at: string;
};

type TravelerCountryRow = {
  country_name: string;
};

type TravelerInquiryRow = Pick<
  TravelerInquiry,
  | "id"
  | "listing_id"
  | "destination"
  | "destination_country"
  | "operator_name"
  | "preferred_start_date"
  | "preferred_end_date"
  | "availability"
  | "notes"
  | "status"
  | "created_at"
>;

export type ConciergeRecommendation = {
  id: string;
  title: string;
  summary: string;
  location: string;
  country: string;
  duration: string;
  price: string | null;
  operator_name: string;
  image_url: string | null;
  reason: string;
  score: number;
  href: string;
};

export type ConciergeKnowledgeSource = {
  id: string;
  source_type: string;
  title: string;
  content: string;
  url: string | null;
  metadata: Record<string, unknown> | null;
  score: number;
};

export type ConciergeTravelerContext = {
  profile: TravelerProfileRow | null;
  countries: string[];
  recentInquiries: Array<
    TravelerInquiryRow & {
      listing_title: string | null;
    }
  >;
};

export type ConciergeContextBundle = {
  query: string;
  tripIntent: TripIntent;
  tripIntentSummary: string | null;
  traveler: ConciergeTravelerContext | null;
  recommendations: ConciergeRecommendation[];
  knowledgeSources: ConciergeKnowledgeSource[];
  sourceSummaries: Array<{
    id: string;
    sourceType: "listing" | "knowledge_source";
    title: string;
    url: string | null;
    excerpt: string;
    metadata: Record<string, unknown> | null;
  }>;
  promptContext: string;
};

function isMissingRelationOrSchemaCacheError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("Could not find the relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(query: string) {
  return normalizeText(query)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length > 2);
}

function detectIntentTerms(query: string) {
  const normalized = normalizeText(query);
  const matches: string[] = [];
  const groups: Array<{ key: string; terms: string[] }> = [
    { key: "beach", terms: ["beach", "coast", "coastal", "island", "reef", "snorkel", "swim", "sea"] },
    { key: "family", terms: ["family", "kids", "children", "easy", "all ages"] },
    { key: "romantic", terms: ["romantic", "couple", "private", "sunset", "honeymoon"] },
    { key: "budget", terms: ["budget", "affordable", "cheap", "value"] },
    { key: "short", terms: ["short", "half day", "half-day", "day trip", "quick"] },
    { key: "trinidad", terms: ["trinidad"] },
    { key: "tobago", terms: ["tobago"] },
    { key: "culture", terms: ["culture", "heritage", "history", "museum", "music", "festival"] },
    { key: "food", terms: ["food", "culinary", "dining", "taste", "restaurant"] },
    { key: "nature", terms: ["nature", "hike", "hiking", "waterfall", "wildlife", "trail", "outdoor"] },
  ];

  for (const group of groups) {
    if (group.terms.some((term) => normalized.includes(term))) {
      matches.push(group.key);
    }
  }

  return matches;
}

function scoreText(haystack: string, queryTokens: string[]) {
  const normalized = normalizeText(haystack);
  let score = 0;

  for (const token of queryTokens) {
    if (normalized.includes(token)) {
      score += 6;
    }
  }

  return score;
}

function buildListingReason(listing: TourListing, query: string, score: number) {
  const intentTerms = detectIntentTerms(query);
  if (intentTerms.includes("beach") && /beach|coast|coastal|sea|reef|snorkel|island/i.test(`${listing.title} ${listing.summary} ${listing.location} ${listing.country}`)) {
    return "Matches a beach or coastal request.";
  }
  if (intentTerms.includes("family")) {
    return "A good fit for a family-friendly trip.";
  }
  if (intentTerms.includes("romantic")) {
    return "A private, slower-paced option for a couple or getaway.";
  }
  if (intentTerms.includes("budget")) {
    return "One of the stronger value-oriented options currently available.";
  }
  if (intentTerms.includes("short")) {
    return "A practical option for a shorter trip or quick getaway.";
  }
  if (score > 0) {
    return "Matched to your current travel request.";
  }
  return listing.featured ? "Featured by TT Connect." : "A current TT Connect listing.";
}

function isFetchFailedError(error: unknown) {
  return error instanceof Error && (error.message === "TypeError: fetch failed" || error.message.includes("fetch failed"));
}

export async function getRelevantListings(query: string, limit = 5, tripIntent?: TripIntent) {
  try {
    const intent = tripIntent ?? parseTripIntent(query);
    const searchQuery = expandQueryWithTripIntent(query, intent);
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin
      .from("tour_listings")
      .select("id,title,location,country,duration,summary,image_url,image_base64,price,operator_id,operator_name,featured,is_active,created_at,updated_at")
      .eq("is_active", true)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingRelationOrSchemaCacheError(error) || isFetchFailedError(error)) {
        return [] as ConciergeRecommendation[];
      }

      throw new Error(error.message);
    }

    const tokens = tokenize(searchQuery);
    const rows = (data ?? []) as Array<TourListing & { image_base64?: string | null }>;
    const scored = rows
      .map((listing) => {
        const haystack = [
          listing.title,
          listing.location,
          listing.country,
          listing.duration,
          listing.summary,
          listing.operator_name,
          listing.price ?? "",
        ].join(" ");
        let score = tokens.length ? scoreText(haystack, tokens) : 0;

        for (const destination of intent.destinations) {
          if (normalizeText(haystack).includes(normalizeText(destination))) {
            score += 8;
          }
        }

        for (const interest of intent.interests) {
          if (normalizeText(haystack).includes(normalizeText(interest.split(" ")[0] ?? interest))) {
            score += 4;
          }
        }

        if (listing.featured) {
          score += 2;
        }

        if (tokens.length === 0) {
          score += listing.featured ? 8 : 1;
        }

        return {
          ...listing,
          image_url: normalizeMediaSource(listing.image_base64) ?? normalizeMediaSource(listing.image_url),
          score,
        };
      })
      .sort((left, right) => right.score - left.score || Number(right.featured) - Number(left.featured) || new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

    const selected = tokens.length
      ? scored.filter((listing) => listing.score > 0).slice(0, limit)
      : scored.slice(0, limit);

    if (selected.length === 0 && scored.length > 0) {
      return scored.slice(0, Math.min(limit, 3)).map((listing) => ({
        id: listing.id,
        title: listing.title,
        summary: listing.summary,
        location: listing.location,
        country: listing.country,
        duration: listing.duration,
        price: listing.price ?? null,
        operator_name: listing.operator_name,
        image_url: listing.image_url,
        reason: "A helpful current option from TT Connect.",
        score: listing.score,
        href: `/Enquiry?listing=${listing.id}`,
      }));
    }

    return selected.map((listing) => ({
      id: listing.id,
      title: listing.title,
      summary: listing.summary,
      location: listing.location,
      country: listing.country,
      duration: listing.duration,
      price: listing.price ?? null,
      operator_name: listing.operator_name,
      image_url: listing.image_url,
      reason: buildListingReason(listing, searchQuery, listing.score),
      score: listing.score,
      href: `/Enquiry?listing=${listing.id}`,
    }));
  } catch (error) {
    if (isFetchFailedError(error)) {
      return [] as ConciergeRecommendation[];
    }

    console.error("Unable to load concierge listings", error);
    return [] as ConciergeRecommendation[];
  }
}

export async function getRelevantKnowledgeSources(query: string, limit = 5) {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin
      .from("concierge_knowledge_sources")
      .select("id,source_type,title,content,url,metadata,is_active,created_at,updated_at")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingRelationOrSchemaCacheError(error) || isFetchFailedError(error)) {
        return [] as ConciergeKnowledgeSource[];
      }

      throw new Error(error.message);
    }

    const tokens = tokenize(query);
    const rows = (data ?? []) as KnowledgeSourceRow[];

    return rows
      .map((source) => ({
        ...source,
        score: tokens.length ? scoreText([source.title, source.content, source.source_type].join(" "), tokens) : 0,
      }))
      .sort((left, right) => right.score - left.score || new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
      .filter((source) => tokens.length === 0 || source.score > 0)
      .slice(0, limit)
      .map((source) => ({
        id: source.id,
        source_type: source.source_type,
        title: source.title,
        content: source.content,
        url: source.url,
        metadata: source.metadata,
        score: source.score,
      }));
  } catch (error) {
    if (isFetchFailedError(error)) {
      return [] as ConciergeKnowledgeSource[];
    }

    console.error("Unable to load concierge knowledge sources", error);
    return [] as ConciergeKnowledgeSource[];
  }
}

export async function getTravelerContext(userId: string): Promise<ConciergeTravelerContext | null> {
  try {
    const admin = createSupabaseServiceRoleClient();

    const profileResult = await admin
      .from("profiles")
      .select("id,email,full_name,preferred_inquiry_area,role,created_at,updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (profileResult.error) {
      if (isMissingRelationOrSchemaCacheError(profileResult.error) || isFetchFailedError(profileResult.error)) {
        return null;
      }

      throw new Error(profileResult.error.message);
    }

    const profile = (profileResult.data ?? null) as TravelerProfileRow | null;

    const { data: countryData, error: countryError } = await admin
      .from("traveler_countries")
      .select("country_name")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (countryError && !isMissingRelationOrSchemaCacheError(countryError) && !isFetchFailedError(countryError)) {
      throw new Error(countryError.message);
    }

    const { data: inquiryData, error: inquiryError } = await admin
      .from("inquiries")
      .select("id,listing_id,destination,destination_country,operator_name,preferred_start_date,preferred_end_date,availability,notes,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (inquiryError && !isMissingRelationOrSchemaCacheError(inquiryError) && !isFetchFailedError(inquiryError)) {
      throw new Error(inquiryError.message);
    }

    const inquiries = (inquiryData ?? []) as TravelerInquiryRow[];
    const listingIds = [...new Set(inquiries.map((inquiry) => inquiry.listing_id).filter((value): value is string => Boolean(value)))];

    let listingsById = new Map<string, Pick<TourListing, "id" | "title">>();

    if (listingIds.length > 0) {
      const { data: listingData, error: listingError } = await admin
        .from("tour_listings")
        .select("id,title")
        .in("id", listingIds);

      if (listingError && !isMissingRelationOrSchemaCacheError(listingError) && !isFetchFailedError(listingError)) {
        throw new Error(listingError.message);
      }

      listingsById = new Map(((listingData ?? []) as Array<Pick<TourListing, "id" | "title">>).map((listing) => [listing.id, listing]));
    }

    return {
      profile,
      countries: ((countryData ?? []) as TravelerCountryRow[]).map((entry) => entry.country_name).filter(Boolean),
      recentInquiries: inquiries.map((inquiry) => ({
        ...inquiry,
        listing_title: inquiry.listing_id ? listingsById.get(inquiry.listing_id)?.title ?? null : null,
      })),
    };
  } catch (error) {
    if (isFetchFailedError(error)) {
      return null;
    }

    console.error("Unable to load concierge traveler context", error);
    return null;
  }
}

export async function buildConciergeContext(params: {
  query: string;
  userId?: string | null;
  conversationMessages?: Array<{ role: string; content: string }>;
}) {
  try {
    const tripIntent = params.conversationMessages?.length
      ? parseTripIntentFromConversation(params.conversationMessages)
      : parseTripIntent(params.query);
    const tripIntentSummary = formatTripIntentSummary(tripIntent);
    const tripIntentPrompt = formatTripIntentPromptBlock(tripIntent);
    const traveler = params.userId ? await getTravelerContext(params.userId) : null;
    const [recommendations, knowledgeSources] = await Promise.all([
      getRelevantListings(params.query, 5, tripIntent),
      getRelevantKnowledgeSources(expandQueryWithTripIntent(params.query, tripIntent), 5),
    ]);

    const sourceSummaries = [
      ...recommendations.map((listing) => ({
        id: listing.id,
        sourceType: "listing" as const,
        title: listing.title,
        url: listing.href,
        excerpt: listing.summary,
        metadata: {
          location: listing.location,
          country: listing.country,
          duration: listing.duration,
          price: listing.price,
          operator_name: listing.operator_name,
          reason: listing.reason,
        },
      })),
      ...knowledgeSources.map((source) => ({
        id: source.id,
        sourceType: "knowledge_source" as const,
        title: source.title,
        url: source.url,
        excerpt: source.content.slice(0, 220),
        metadata: source.metadata,
      })),
    ];

    const travelerLines = traveler
      ? [
          `Traveller: ${traveler.profile?.full_name ?? "Logged-in traveller"}`,
          traveler.profile?.preferred_inquiry_area ? `Preferred area: ${traveler.profile.preferred_inquiry_area}` : null,
          traveler.countries.length ? `Countries on file: ${traveler.countries.join(", ")}` : null,
          traveler.recentInquiries.length
            ? `Recent enquiries: ${traveler.recentInquiries
                .map((inquiry) => {
                  const listingTitle = inquiry.listing_title ?? inquiry.destination;
                  return `${listingTitle} (${inquiry.status}${inquiry.preferred_start_date ? `, ${inquiry.preferred_start_date}` : ""})`;
                })
                .join("; ")}`
            : null,
        ].filter(Boolean)
      : ["No traveler profile is available. Use the public listing catalog and active knowledge sources."];

    const recommendationLines = recommendations.length
      ? recommendations.map(
          (listing) =>
            `- ${listing.title} | ${listing.location}, ${listing.country} | ${listing.duration} | ${listing.price ?? "Price on request"} | Operator: ${listing.operator_name} | Reason: ${listing.reason}`,
        )
      : ["No active listings matched this query exactly."];

    const knowledgeLines = knowledgeSources.length
      ? knowledgeSources.map((source) => `- [${source.source_type}] ${source.title}: ${source.content.slice(0, 220)}`)
      : ["No active knowledge sources matched this query exactly."];

    const promptContext = [
      "TT Connect platform context:",
      ...(tripIntentPrompt ? [tripIntentPrompt, ""] : []),
      ...travelerLines.map((line) => `- ${line}`),
      "Relevant listings:",
      ...recommendationLines,
      "Relevant knowledge sources:",
      ...knowledgeLines,
      "Rules:",
      "- Use only the provided platform context for listings, pricing, and availability.",
      "- If a price or availability is missing, say the operator will confirm it.",
      "- Recommend real TT Connect listings when helpful.",
      "- If there are no precise matches, be transparent and suggest the best available alternatives from the active catalog.",
      "- Keep the reply friendly, concise, and helpful.",
    ].join("\n");

    return {
      query: params.query,
      tripIntent,
      tripIntentSummary,
      traveler,
      recommendations,
      knowledgeSources,
      sourceSummaries,
      promptContext,
    } satisfies ConciergeContextBundle;
  } catch (error) {
    if (!isFetchFailedError(error)) {
      console.error("Unable to build concierge context", error);
    }

    return {
      query: params.query,
      tripIntent: parseTripIntent(params.query),
      tripIntentSummary: null,
      traveler: null,
      recommendations: [],
      knowledgeSources: [],
      sourceSummaries: [],
      promptContext: [
        "TT Connect platform context:",
        "- No live platform data is available right now.",
        "Rules:",
        "- Use only the provided platform context for listings, pricing, and availability.",
        "- If a price or availability is missing, say the operator will confirm it.",
        "- Keep the reply friendly, concise, and helpful.",
      ].join("\n"),
    } satisfies ConciergeContextBundle;
  }
}
