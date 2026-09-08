import Link from "next/link";
import { CATEGORIES, ISLANDS, type CategorySlug, type IslandSlug } from "@/lib/listing-taxonomy";

type FilterProps = {
  island: IslandSlug | null;
  category: CategorySlug | null;
  /** Result counts, so a filter that would empty the page says so up front. */
  islandCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
};

/**
 * Server-rendered filters: each chip is a link carrying the current selection,
 * so filtering works without JavaScript, is linkable, and is indexable. The
 * landing page links straight into these same URLs.
 */
function buildHref(island: IslandSlug | null, category: CategorySlug | null) {
  const params = new URLSearchParams();
  if (island) params.set("island", island);
  if (category) params.set("category", category);
  const query = params.toString();
  return query ? `/Experiences?${query}` : "/Experiences";
}

export function ExperienceFilters({ island, category, islandCounts, categoryCounts }: FilterProps) {
  return (
    <div className="xp-filters">
      <div className="xp-filter-group">
        <p className="xp-filter-label" id="filter-island">
          Island
        </p>
        <div className="xp-chip-row" role="group" aria-labelledby="filter-island">
          <Link
            className={`xp-chip${island === null ? " is-active" : ""}`}
            href={buildHref(null, category)}
            aria-current={island === null ? "true" : undefined}
          >
            Anywhere
          </Link>
          {ISLANDS.map((option) => (
            <Link
              key={option.slug}
              className={`xp-chip${island === option.slug ? " is-active" : ""}`}
              href={buildHref(option.slug, category)}
              aria-current={island === option.slug ? "true" : undefined}
            >
              {option.label}
              <span className="xp-chip-count">{islandCounts[option.slug] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="xp-filter-group">
        <p className="xp-filter-label" id="filter-category">
          Type of trip
        </p>
        <div className="xp-chip-row" role="group" aria-labelledby="filter-category">
          <Link
            className={`xp-chip${category === null ? " is-active" : ""}`}
            href={buildHref(island, null)}
            aria-current={category === null ? "true" : undefined}
          >
            All types
          </Link>
          {CATEGORIES.map((option) => (
            <Link
              key={option.slug}
              className={`xp-chip${category === option.slug ? " is-active" : ""}`}
              href={buildHref(island, option.slug)}
              aria-current={category === option.slug ? "true" : undefined}
            >
              <span className="material-symbols-outlined xp-chip-icon" aria-hidden="true">
                {option.icon}
              </span>
              {option.label}
              <span className="xp-chip-count">{categoryCounts[option.slug] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>

      {island || category ? (
        <Link className="xp-clear" href="/Experiences">
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
