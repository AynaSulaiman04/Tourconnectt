import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { ExperienceCard, type ExperienceCardData } from "@/app/Experiences/ExperienceCard";
import { LandingBrowseFilters } from "./LandingBrowseFilters";
import { ISLANDS, type IslandSlug } from "@/lib/listing-taxonomy";
import "@/app/Experiences/page.css";
import { AnimatedHeroHeadline } from "@/components/ui/animated-hero";
import { getHeroContentFromSiteContent, getPortalSettingsFromContent } from "@/lib/portal-settings";
import { LandingTripPrompt } from "@/components/landing/LandingTripPrompt";
import { LandingHeroVideo } from "./LandingHeroVideo";
import { LandingImageSlideshow } from "./LandingImageSlideshow";
import { LandingScrollReveal } from "./LandingScrollReveal";
import type { SiteContent } from "@/lib/site-content";
import "./page.css";

export type LandingListingCard = ExperienceCardData & {
  country: string | null;
  /** Resolved server-side so the view does not re-derive it per render. */
  island: IslandSlug;
};

export type LandingTestimonial = {
  id: string;
  text: string;
  name: string;
  location: string;
  avatarUrl: string | null;
  rating: number;
};

type LandingPageViewProps = {
  listings: LandingListingCard[];
  testimonials: LandingTestimonial[];
  showcaseImages: string[];
  heroVideo: { url: string; contentType: string | null; fallbackUrl?: string | null; posterUrl?: string | null } | null;
  siteContent: SiteContent;
  reviewSummary: {
    averageRating: number;
    reviewCount: number;
  } | null;
};

function formatRating(value: number) {
  return value.toFixed(1);
}

function resolveListings(listings: LandingListingCard[]) {
  return listings;
}

export function LandingPageView({
  listings,
  testimonials,
  reviewSummary,
  showcaseImages,
  heroVideo,
  siteContent,
}: LandingPageViewProps) {
  const featuredListings = resolveListings(listings);
  const islandSections = ISLANDS.map((option) => ({
    slug: option.slug,
    label: option.label,
    blurb: option.blurb,
    items: featuredListings.filter(
      (listing) => listing.island === option.slug || (option.slug !== "both" && listing.island === "both"),
    ),
  })).filter((section) => section.items.length > 0);
  const testimonialsToRender = testimonials;
  const hasListings = featuredListings.length > 0;
  const slideshowImages = showcaseImages;
  const heroContent = getHeroContentFromSiteContent(siteContent);
  const portalSettings = getPortalSettingsFromContent(siteContent);

  return (
    <main className="lp-page">
      <LandingScrollReveal />

      <section className="lp-hero" data-has-video={heroVideo ? "true" : undefined}>
        {heroVideo ? <LandingHeroVideo
            contentType={heroVideo.contentType}
            fallbackSrc={heroVideo.fallbackUrl}
            poster={heroVideo.posterUrl}
            src={heroVideo.url}
          /> : null}
        <div className="lp-hero-inner" data-lp-reveal>
          <AnimatedHeroHeadline
            description={heroContent.description}
            eyebrow={heroContent.eyebrow}
            phrases={heroContent.phrases}
            prefix={heroContent.prefix}
            rotationIntervalMs={heroContent.rotationIntervalMs}
          />

          <LandingTripPrompt />

          <div className="lp-hero-doors">
            <Button href="/ConciergeChat" variant="primary" className="lp-door">
              Talk to the concierge
            </Button>
            <Button href="/Enquiry" variant="outline" className="lp-door">
              Browse the experiences
            </Button>
          </div>

          <div className="lp-hero-actions">
            <Button href="/SignUp" variant="ghost" className="btn-sm lp-register-btn">
              Register as Traveller
            </Button>
          </div>
        </div>
      </section>

      <div data-lp-reveal>
        <LandingBrowseFilters />
      </div>

      <div className="lp-showcase-wrap" data-lp-reveal>
        <LandingImageSlideshow images={slideshowImages} intervalMs={portalSettings.slideshowIntervalMs} />
      </div>

      <section className="lp-section" aria-labelledby="featured-listings" data-lp-reveal>
        <div className="lp-section-head" data-lp-reveal>
          <div>
            <p className="lp-section-eyebrow">Handpicked experiences</p>
            <h2 id="featured-listings">Experiences on the islands</h2>
          </div>

          <Button href="/Experiences" variant="outline" className="btn-sm">
            See every experience
          </Button>
        </div>

        {hasListings ? (
          islandSections.map((section) => (
            <section
              className="xp-section"
              key={section.slug}
              aria-labelledby={`lp-island-${section.slug}`}
              data-lp-reveal
            >
              <div className="xp-section-head">
                <h2 id={`lp-island-${section.slug}`}>{section.label}</h2>
                <p>{section.blurb}</p>
              </div>
              <div className="xp-grid">
                {section.items.map((listing) => (
                  <ExperienceCard key={listing.id} listing={listing} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="lp-empty-card">
            <p className="lp-section-eyebrow">Experiences</p>
            <h3>No live listings are available yet.</h3>
            <p>
              Operators publish their own experiences here. As soon as the first listings go live they
              will appear on this page and in the browse pages.
            </p>
          </div>
        )}
      </section>

      {testimonialsToRender.length > 0 ? (
      <section className="lp-section lp-testimonials" aria-labelledby="testimonials" data-lp-reveal>
        <div className="lp-section-head" data-lp-reveal>
          <div>
            <p className="lp-section-eyebrow">Traveller trust</p>
            <h2 id="testimonials">Loved by discerning travellers worldwide.</h2>
          </div>

          {reviewSummary ? (
            <div className="lp-rating">
              <strong>{formatRating(reviewSummary.averageRating)}</strong>
              <span>/5</span>
              <small>
                {`Based on ${reviewSummary.reviewCount.toLocaleString()} verified ${reviewSummary.reviewCount === 1 ? "review" : "reviews"}`}
              </small>
            </div>
          ) : null}
        </div>

        <div className="lp-testimonial-grid">
          {testimonialsToRender.slice(0, 3).map((item) => (
            <article className="lp-testimonial-card" key={item.id} data-lp-reveal>
              <p className="lp-quote">“{item.text}”</p>
              <div className="lp-person">
                {item.avatarUrl ? (
                  <Image
                    className="lp-avatar"
                    alt={item.name}
                    width={40}
                    height={40}
                    src={item.avatarUrl}
                    unoptimized={item.avatarUrl.startsWith("data:") || item.avatarUrl.startsWith("blob:")}
                  />
                ) : (
                  <div className="lp-avatar" aria-hidden="true">
                    {item.name.charAt(0)}
                  </div>
                )}
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.location}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      ) : null}
    </main>
  );
}
