/**
 * The fixed vocabulary travellers browse by and operators publish against.
 *
 * These values are written to `tour_listings.island` / `.category` and are
 * enforced by check constraints in the database, so the slugs here must stay in
 * step with `20260907000000_add_listing_browse_and_pricing_fields.sql`. They are
 * also URL query values on /Experiences, so treat them as a public contract:
 * add new entries rather than renaming existing ones.
 */

export type IslandSlug = "trinidad" | "tobago" | "both";
export type CategorySlug =
  | "beach"
  | "rainforest"
  | "heritage"
  | "sailing"
  | "food-drink"
  | "wildlife"
  | "adventure"
  | "city-culture";

export type PriceBasis = "per_person" | "per_group" | "total";
export type PriceCurrency = "TTD" | "USD";

export const ISLANDS: ReadonlyArray<{ slug: IslandSlug; label: string; blurb: string }> = [
  { slug: "trinidad", label: "Trinidad", blurb: "Rainforest, Carnival, food, and the wilder coastlines." },
  { slug: "tobago", label: "Tobago", blurb: "Reefs, quiet beaches, sailing, and the oldest protected forest." },
  { slug: "both", label: "Both islands", blurb: "Trips that cross between the two." },
];

export const CATEGORIES: ReadonlyArray<{ slug: CategorySlug; label: string; icon: string }> = [
  { slug: "beach", label: "Beach", icon: "beach_access" },
  { slug: "rainforest", label: "Rainforest", icon: "forest" },
  { slug: "heritage", label: "Heritage", icon: "account_balance" },
  { slug: "sailing", label: "Sailing", icon: "sailing" },
  { slug: "food-drink", label: "Food & drink", icon: "restaurant" },
  { slug: "wildlife", label: "Wildlife", icon: "pets" },
  { slug: "adventure", label: "Adventure", icon: "hiking" },
  { slug: "city-culture", label: "City & culture", icon: "festival" },
];

export const PRICE_BASES: ReadonlyArray<{ slug: PriceBasis; label: string; short: string }> = [
  { slug: "per_person", label: "Per person", short: "per person" },
  { slug: "per_group", label: "Per group", short: "per group" },
  { slug: "total", label: "Total price", short: "total" },
];

export const PRICE_CURRENCIES: ReadonlyArray<PriceCurrency> = ["TTD", "USD"];

const ISLAND_SLUGS = new Set<string>(ISLANDS.map((island) => island.slug));
const CATEGORY_SLUGS = new Set<string>(CATEGORIES.map((category) => category.slug));
const PRICE_BASIS_SLUGS = new Set<string>(PRICE_BASES.map((basis) => basis.slug));

export function parseIsland(value: unknown): IslandSlug | null {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ISLAND_SLUGS.has(slug) ? (slug as IslandSlug) : null;
}

export function parseCategory(value: unknown): CategorySlug | null {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  return CATEGORY_SLUGS.has(slug) ? (slug as CategorySlug) : null;
}

export function parsePriceBasis(value: unknown): PriceBasis | null {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  return PRICE_BASIS_SLUGS.has(slug) ? (slug as PriceBasis) : null;
}

export function parsePriceCurrency(value: unknown): PriceCurrency | null {
  const slug = typeof value === "string" ? value.trim().toUpperCase() : "";
  return slug === "TTD" || slug === "USD" ? slug : null;
}

export function islandLabel(value: unknown): string | null {
  const slug = parseIsland(value);
  return slug ? (ISLANDS.find((island) => island.slug === slug)?.label ?? null) : null;
}

export function categoryLabel(value: unknown): string | null {
  const slug = parseCategory(value);
  return slug ? (CATEGORIES.find((category) => category.slug === slug)?.label ?? null) : null;
}

export function priceBasisLabel(value: unknown): string | null {
  const slug = parsePriceBasis(value);
  return slug ? (PRICE_BASES.find((basis) => basis.slug === slug)?.short ?? null) : null;
}

/**
 * Falls back to the free-text location when a listing predates the island
 * column, so a listing never renders as belonging to nowhere.
 *
 * The country of both islands is "Trinidad and Tobago", so a naive substring
 * search for "tobago" matches every listing in the country -- including ones
 * in Grande Riviere or the Arima Valley. The country name is therefore removed
 * before looking for an island.
 */
export function resolveIsland(listing: {
  island?: string | null;
  location?: string | null;
  country?: string | null;
}): IslandSlug {
  const explicit = parseIsland(listing.island);
  if (explicit) {
    return explicit;
  }

  const haystack = `${listing.location ?? ""} ${listing.country ?? ""}`
    .toLowerCase()
    .replace(/trinidad\s*(?:and|&|\+)\s*tobago/g, " ")
    .replace(/\bt\s*&\s*t\b/g, " ");

  const tobago = haystack.includes("tobago");
  const trinidad = haystack.includes("trinidad");

  if (tobago && trinidad) {
    return "both";
  }

  if (tobago) {
    return "tobago";
  }

  // Trinidad is the larger island and the default for anything unlabelled.
  return "trinidad";
}
