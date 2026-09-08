import type { Metadata } from "next";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { getInquiryListings } from "@/lib/supabase/inquiry";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { hasSupabaseSessionCookie } from "@/lib/supabase/session-cookie";
import { getRequestGeo } from "@/lib/format/locale";
import { formatListingPriceLabel } from "@/lib/format/listing-price-label";
import { currencyForCountry, getTtdRate } from "@/lib/format/currency-conversion";
import {
  ISLANDS,
  parseCategory,
  parseIsland,
  resolveIsland,
  categoryLabel,
  islandLabel,
  type IslandSlug,
} from "@/lib/listing-taxonomy";
import { cookies } from "next/headers";
import { ExperienceCard, type ExperienceCardData } from "./ExperienceCard";
import { ExperienceFilters } from "./ExperienceFilters";
import "./page.css";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Experiences in Trinidad and Tobago | Tour ConnecTT",
  description:
    "Browse experiences run by local operators across Trinidad and Tobago. Filter by island and by the kind of trip you want.",
};

type ExperiencesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExperiencesPage({ searchParams }: ExperiencesPageProps) {
  const resolved = (await searchParams) ?? {};
  const island = parseIsland(first(resolved.island));
  const category = parseCategory(first(resolved.category));

  const cookieStore = await cookies();
  const hasSession = hasSupabaseSessionCookie(cookieStore.getAll());

  const [listings, profileContext, geo] = await Promise.all([
    getInquiryListings(),
    hasSession ? getOptionalCurrentUserProfile().catch(() => null) : Promise.resolve(null),
    getRequestGeo(),
  ]);

  const targetCurrency = currencyForCountry(geo.country);
  const ttdRate = targetCurrency === "TTD" ? 1 : await getTtdRate(targetCurrency).catch(() => null);

  // Counts describe the catalogue as a whole, so a chip always shows how many
  // results it would yield rather than counting only what is already on screen.
  const islandCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const listing of listings) {
    const listingIsland = resolveIsland(listing);
    islandCounts[listingIsland] = (islandCounts[listingIsland] ?? 0) + 1;
    if (listing.category) {
      categoryCounts[listing.category] = (categoryCounts[listing.category] ?? 0) + 1;
    }
  }

  const filtered = listings.filter((listing) => {
    // "Both islands" listings belong to Trinidad and to Tobago alike, so they
    // should not vanish when a traveller picks one.
    const listingIsland = resolveIsland(listing);
    const islandMatches =
      !island || listingIsland === island || listingIsland === "both" || island === "both";
    const categoryMatches = !category || listing.category === category;
    return islandMatches && categoryMatches;
  });

  function toCard(listing: (typeof listings)[number]): ExperienceCardData {
    return {
      id: listing.id,
      title: listing.title,
      location: listing.location ?? null,
      duration: listing.duration ?? null,
      summary: listing.summary ?? null,
      imageUrl: listing.image_url ?? null,
      operatorName: listing.operator_name ?? null,
      category: listing.category ?? null,
      price: formatListingPriceLabel({
        price: listing.price,
        currency: listing.price_currency,
        basis: listing.price_basis,
        locale: geo.locale,
        targetCurrency,
        ttdRate,
      }),
    };
  }

  // Grouped by island unless the traveller has already narrowed to one, in
  // which case a single flat grid is the clearer answer.
  const sections =
    island === null
      ? ISLANDS.map((option) => ({
          slug: option.slug as IslandSlug,
          label: option.label,
          blurb: option.blurb,
          items: filtered.filter((listing) => resolveIsland(listing) === option.slug),
        })).filter((section) => section.items.length > 0)
      : [];

  const activeSummary = [islandLabel(island), categoryLabel(category)].filter(Boolean).join(" · ");

  return (
    <PageShell
      authResolved={hasSession}
      travelerProfile={
        profileContext?.profile
          ? {
              id: profileContext.profile.id,
              full_name: profileContext.profile.full_name,
              profile_image_url: profileContext.profile.profile_image_url,
              role: profileContext.profile.role,
            }
          : null
      }
      variant="public"
    >
      <main className="xp-page">
        <header className="xp-head">
          <p className="section-eyebrow">Experiences</p>
          <h1 className="xp-title">Browse Trinidad and Tobago.</h1>
          <p className="xp-lede">
            Every experience below is run by a local operator who sets their own dates and prices. Pick an
            island, pick the kind of trip you want, then talk to the person who runs it.
          </p>
        </header>

        <ExperienceFilters
          island={island}
          category={category}
          islandCounts={islandCounts}
          categoryCounts={categoryCounts}
        />

        <p className="xp-result-count" role="status">
          {filtered.length === 0
            ? "No experiences match those filters yet."
            : `${filtered.length} ${filtered.length === 1 ? "experience" : "experiences"}`}
          {activeSummary ? ` · ${activeSummary}` : ""}
        </p>

        {filtered.length === 0 ? (
          <div className="xp-empty">
            <h2>Nothing here yet.</h2>
            <p>
              {listings.length === 0
                ? "No operator listings are live at the moment. New experiences appear here as soon as operators publish them."
                : "Try a different island or type of trip, or clear the filters to see everything."}
            </p>
            <div className="xp-empty-actions">
              <Button href="/Experiences" variant="outline" className="btn-sm">
                See all experiences
              </Button>
              <Button href="/ConciergeChat" variant="primary" className="btn-sm">
                Ask the concierge
              </Button>
            </div>
          </div>
        ) : island === null ? (
          sections.map((section) => (
            <section className="xp-section" key={section.slug} aria-labelledby={`island-${section.slug}`}>
              <div className="xp-section-head">
                <h2 id={`island-${section.slug}`}>{section.label}</h2>
                <p>{section.blurb}</p>
              </div>
              <div className="xp-grid">
                {section.items.map((listing) => (
                  <ExperienceCard key={listing.id} listing={toCard(listing)} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="xp-grid">
            {filtered.map((listing) => (
              <ExperienceCard key={listing.id} listing={toCard(listing)} />
            ))}
          </div>
        )}
      </main>
    </PageShell>
  );
}
