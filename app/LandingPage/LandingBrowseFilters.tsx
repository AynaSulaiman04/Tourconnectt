import Link from "next/link";
import { CATEGORIES, ISLANDS } from "@/lib/listing-taxonomy";

/**
 * The shortcut into the catalogue, directly beneath the hero. These link into
 * /Experiences rather than filtering in place, so one page owns browsing and
 * every filtered view is a shareable URL.
 */
export function LandingBrowseFilters() {
  return (
    <section className="lp-browse" aria-labelledby="browse-heading">
      <div className="lp-browse-inner">
        <div className="lp-browse-head">
          <h2 id="browse-heading">Or just have a look around.</h2>
          <p>Pick an island, or the kind of trip you are after.</p>
        </div>

        <div className="lp-browse-row" aria-label="Browse by island">
          {ISLANDS.map((island) => (
            <Link className="lp-browse-island" href={island.slug === "both" ? "/Experiences" : `/Experiences?island=${island.slug}`} key={island.slug}>
              <span className="lp-browse-island-name">{island.label}</span>
              <span className="lp-browse-island-blurb">{island.blurb}</span>
            </Link>
          ))}
        </div>

        <div className="lp-browse-row lp-browse-categories" aria-label="Browse by type of trip">
          {CATEGORIES.map((category) => (
            <Link
              className="lp-browse-chip"
              href={`/Experiences?category=${category.slug}`}
              key={category.slug}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {category.icon}
              </span>
              {category.label}
            </Link>
          ))}
        </div>

        <Link className="lp-browse-all" href="/Experiences">
          See every experience
        </Link>
      </div>
    </section>
  );
}
