import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { getListingDetail } from "@/lib/supabase/listing-detail";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { hasSupabaseSessionCookie } from "@/lib/supabase/session-cookie";
import { getRequestGeo } from "@/lib/format/locale";
import { formatListingPriceLabel } from "@/lib/format/listing-price-label";
import { resolveDisplayCurrency } from "@/lib/format/display-currency";
import { categoryLabel, islandLabel, resolveIsland } from "@/lib/listing-taxonomy";
import "../page.css";
import "./detail.css";

export const revalidate = 60;

type DetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: DetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingDetail(id);

  if (!listing) {
    return { title: "Experience not found | Tour ConnecTT" };
  }

  return {
    title: `${listing.title} | Tour ConnecTT`,
    description: listing.summary?.slice(0, 200) ?? undefined,
  };
}

/** Operators write these as free text, one item per line or separated by commas. */
function toList(value: string | null) {
  if (!value) return [];
  const byLine = value
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  if (byLine.length > 1) {
    return byLine;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default async function ExperienceDetailPage({ params }: DetailPageProps) {
  const { id } = await params;
  const listing = await getListingDetail(id);

  if (!listing) {
    notFound();
  }

  const cookieStore = await cookies();
  const hasSession = hasSupabaseSessionCookie(cookieStore.getAll());

  const [profileContext, geo] = await Promise.all([
    hasSession ? getOptionalCurrentUserProfile().catch(() => null) : Promise.resolve(null),
    getRequestGeo(),
  ]);

  const { currency: targetCurrency, rate: ttdRate } = await resolveDisplayCurrency(geo.country);

  const price = formatListingPriceLabel({
    price: listing.price,
    currency: listing.price_currency,
    basis: listing.price_basis,
    locale: geo.locale,
    targetCurrency,
    ttdRate,
  });

  const island = islandLabel(resolveIsland(listing));
  const category = categoryLabel(listing.category);
  const inclusions = toList(listing.inclusions);
  const exclusions = toList(listing.exclusions);
  const enquireHref = `/Enquiry?listing=${listing.id}`;

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
      <main className="xd-page">
        <nav className="xd-crumbs" aria-label="Breadcrumb">
          <Link href="/Experiences">Experiences</Link>
          <span aria-hidden="true">/</span>
          {island ? (
            <>
              <Link href={`/Experiences?island=${resolveIsland(listing)}`}>{island}</Link>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span className="xd-crumb-current">{listing.title}</span>
        </nav>

        <header className="xd-head">
          <div className="xd-head-text">
            <div className="xd-tags">
              {category ? (
                <Link className="xd-tag" href={`/Experiences?category=${listing.category}`}>
                  {category}
                </Link>
              ) : null}
              {island ? <span className="xd-tag xd-tag-quiet">{island}</span> : null}
            </div>
            <h1 className="xd-title">{listing.title}</h1>
            <p className="xd-meta">
              {listing.location || "Location on request"}
              {listing.duration ? <span aria-hidden="true"> · </span> : null}
              {listing.duration}
            </p>
          </div>
        </header>

        <div className="xd-media">
          {listing.image_url ? (
            <Image
              fill
              priority
              alt={listing.title}
              sizes="(max-width: 1100px) 100vw, 66vw"
              src={listing.image_url}
              unoptimized={listing.image_url.startsWith("data:") || listing.image_url.startsWith("blob:")}
            />
          ) : (
            <div className="xd-media-fallback">
              <span className="material-symbols-outlined" aria-hidden="true">
                photo_camera
              </span>
              <p>This operator has not added a cover image yet.</p>
            </div>
          )}
        </div>

        <div className="xd-layout">
          <div className="xd-main">
            <section className="xd-block" aria-labelledby="about-heading">
              <h2 id="about-heading">About this experience</h2>
              <p className="xd-copy">
                {listing.summary || "The operator has not added a description for this experience yet."}
              </p>
            </section>

            {listing.itinerary ? (
              <section className="xd-block" aria-labelledby="itinerary-heading">
                <h2 id="itinerary-heading">What you will do</h2>
                <p className="xd-copy xd-prewrap">{listing.itinerary}</p>
              </section>
            ) : null}

            {inclusions.length > 0 || exclusions.length > 0 ? (
              <section className="xd-block" aria-labelledby="included-heading">
                <h2 id="included-heading">What is included</h2>
                <div className="xd-include-grid">
                  {inclusions.length > 0 ? (
                    <div>
                      <h3 className="xd-include-title">Included</h3>
                      <ul className="xd-list">
                        {inclusions.map((item, index) => (
                          <li key={index}>
                            <span className="material-symbols-outlined xd-yes" aria-hidden="true">
                              check
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {exclusions.length > 0 ? (
                    <div>
                      <h3 className="xd-include-title">Not included</h3>
                      <ul className="xd-list">
                        {exclusions.map((item, index) => (
                          <li key={index}>
                            <span className="material-symbols-outlined xd-no" aria-hidden="true">
                              close
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="xd-block" aria-labelledby="operator-heading">
              <h2 id="operator-heading">Your operator</h2>
              {/* The operator is the point of the platform, so they are named on
                  the listing rather than hidden behind a generic enquiry form. */}
              <div className="xd-operator">
                <span className="xd-operator-avatar" aria-hidden="true">
                  {(listing.operator_name || "T").charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="xd-operator-name">{listing.operator_name || "Tour ConnecTT operator"}</p>
                  <p className="xd-operator-copy">
                    A local operator reviewed by Tour ConnecTT. They confirm dates, group size, and access
                    needs themselves before anything is paid for.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <aside className="xd-side">
            <div className="xd-booking">
              <div className="xd-price">
                {price ? (
                  <>
                    <strong>{price.amount}</strong>
                    {price.basis ? <span className="xd-price-basis">{price.basis}</span> : null}
                    {price.approx ? <span className="xd-price-approx">{price.approx}</span> : null}
                  </>
                ) : (
                  <strong className="xd-price-tbc">Price on enquiry</strong>
                )}
              </div>

              <dl className="xd-facts">
                {listing.duration ? (
                  <div>
                    <dt>Duration</dt>
                    <dd>{listing.duration}</dd>
                  </div>
                ) : null}
                {listing.capacity ? (
                  <div>
                    <dt>Group size</dt>
                    <dd>Up to {listing.capacity}</dd>
                  </div>
                ) : null}
                {listing.availability ? (
                  <div>
                    <dt>Availability</dt>
                    <dd>{listing.availability}</dd>
                  </div>
                ) : null}
              </dl>

              <Button href={enquireHref} variant="primary" className="xd-cta">
                Enquire about this experience
              </Button>

              <p className="xd-note">
                Enquiring is free and does not book anything. The operator confirms what is possible before
                any payment is taken.
              </p>

              <Link className="xd-secondary" href="/ConciergeChat">
                Ask the concierge about this trip
              </Link>
            </div>
          </aside>
        </div>

        <div className="xd-back">
          <Button href="/Experiences" variant="ghost" className="btn-sm">
            Back to all experiences
          </Button>
        </div>
      </main>
    </PageShell>
  );
}
