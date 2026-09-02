import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AnimatedHeroHeadline } from "@/components/ui/animated-hero";
import { getHeroContentFromSiteContent, getPortalSettingsFromContent } from "@/lib/portal-settings";
import { LandingTripPrompt } from "@/components/landing/LandingTripPrompt";
import { LandingHeroVideo } from "./LandingHeroVideo";
import { LandingImageSlideshow } from "./LandingImageSlideshow";
import { LandingServicesMarquee } from "./LandingServicesMarquee";
import { LandingScrollReveal } from "./LandingScrollReveal";
import type { SiteContent } from "@/lib/site-content";
import "./page.css";

export type LandingListingCard = {
  id: string;
  title: string;
  location: string | null;
  country: string | null;
  duration: string | null;
  summary: string | null;
  imageUrl: string | null;
  operatorName: string | null;
  price: string | null;
  listingHref: string;
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
  heroVideo: { url: string; contentType: string | null } | null;
  siteContent: SiteContent;
  displayCurrency?: string;
  reviewSummary: {
    averageRating: number;
    reviewCount: number;
  } | null;
};

const fallbackTestimonials: LandingTestimonial[] = [
  {
    id: "testimonial-1",
    text: "Every detail was exceptional. From the private guides to the seamless transfers, Tour ConnecTT delivered a journey we\'ll never forget.",
    name: "James L.",
    location: "New York, USA",
    avatarUrl: null,
    rating: 5,
  },
  {
    id: "testimonial-2",
    text: "The heritage experiences were beyond incredible. Access we never could have arranged on our own.",
    name: "Priya M.",
    location: "London, UK",
    avatarUrl: null,
    rating: 5,
  },
  {
    id: "testimonial-3",
    text: "Impeccable planning and 24/7 support. Our family trip was effortless and absolutely magical.",
    name: "Omar R.",
    location: "Dubai, UAE",
    avatarUrl: null,
    rating: 5,
  },
  {
    id: "testimonial-4",
    text: "The Argyle Waterfall hike with a naturalist guide was the highlight of our year. We saw wildlife we never would have spotted alone.",
    name: "Sarah K.",
    location: "Toronto, Canada",
    avatarUrl: null,
    rating: 5,
  },
  {
    id: "testimonial-5",
    text: "Booking through the concierge was faster than any travel agent. Two messages and our whole Tobago week was set.",
    name: "Marcus D.",
    location: "Berlin, Germany",
    avatarUrl: null,
    rating: 5,
  },
  {
    id: "testimonial-6",
    text: "The operators knew every hidden beach, every family-run spot for doubles. It felt like being toured by a local friend.",
    name: "Anika T.",
    location: "Mumbai, India",
    avatarUrl: null,
    rating: 5,
  },
  {
    id: "testimonial-7",
    text: "Leatherback turtle nesting at Grande Rivière was unreal. The operator timed everything perfectly and answered every question.",
    name: "Elena V.",
    location: "Madrid, Spain",
    avatarUrl: null,
    rating: 5,
  },
  {
    id: "testimonial-8",
    text: "Carnival with local hosts is a different level. Costumes, mas camps, transport, food — all arranged, all seamless.",
    name: "Kojo A.",
    location: "Accra, Ghana",
    avatarUrl: null,
    rating: 5,
  },
  {
    id: "testimonial-9",
    text: "We booked last-minute and still had a private catamaran to Nylon Pool the next morning. Impressive turnaround.",
    name: "Rachel P.",
    location: "Sydney, Australia",
    avatarUrl: null,
    rating: 5,
  },
];

function formatRating(value: number) {
  return value.toFixed(1);
}

function resolveListings(listings: LandingListingCard[]) {
  return listings.slice(0, 3);
}

function resolveTestimonials(testimonials: LandingTestimonial[]) {
  const seenIds = new Set(testimonials.map((item) => item.id));
  const merged = [...testimonials];
  for (const fallback of fallbackTestimonials) {
    if (merged.length >= 3) break;
    if (seenIds.has(fallback.id)) continue;
    merged.push(fallback);
  }
  return merged;
}

export function LandingPageView({
  listings,
  testimonials,
  reviewSummary,
  showcaseImages,
  heroVideo,
  siteContent,
  displayCurrency,
}: LandingPageViewProps) {
  const featuredListings = resolveListings(listings);
  const testimonialsToRender = resolveTestimonials(testimonials);
  const hasListings = featuredListings.length > 0;
  const slideshowImages = showcaseImages;
  const heroContent = getHeroContentFromSiteContent(siteContent);
  const portalSettings = getPortalSettingsFromContent(siteContent);

  return (
    <main className="lp-page">
      <LandingScrollReveal />

      <section className="lp-hero" data-has-video={heroVideo ? "true" : undefined}>
        {heroVideo ? <LandingHeroVideo contentType={heroVideo.contentType} src={heroVideo.url} /> : null}
        <div className="lp-hero-inner" data-lp-reveal>
          <AnimatedHeroHeadline
            description={heroContent.description}
            eyebrow={heroContent.eyebrow}
            phrases={heroContent.phrases}
            prefix={heroContent.prefix}
            rotationIntervalMs={heroContent.rotationIntervalMs}
          />

          <LandingTripPrompt />

          <div className="lp-hero-actions">
            <Button href="/SignUp" variant="outline" className="btn-sm lp-register-btn">
              Register as Traveller
            </Button>
          </div>
        </div>
      </section>

      <div className="lp-marquee-wrap" data-lp-reveal>
        <LandingServicesMarquee />
      </div>

      <div className="lp-showcase-wrap" data-lp-reveal>
        <LandingImageSlideshow images={slideshowImages} intervalMs={portalSettings.slideshowIntervalMs} />
      </div>

      <section className="lp-section" aria-labelledby="featured-listings" data-lp-reveal>
        <div className="lp-section-head" data-lp-reveal>
          <div>
            <p className="lp-section-eyebrow">Handpicked experiences</p>
            <h2 id="featured-listings">Featured listings</h2>
            {displayCurrency && displayCurrency !== "TTD" ? (
              <p className="lp-currency-note">
                Prices shown in {displayCurrency} for reference. Bookings are billed in TTD (Trinidad &amp; Tobago Dollar).
              </p>
            ) : null}
          </div>

          <Button href="/Enquiry" variant="outline" className="btn-sm">
            View All Listings
          </Button>
        </div>

        <div className="lp-listings-grid">
          {hasListings ? (
            featuredListings.map((listing) => {
              const listingLocation = listing.location || listing.country || "Location on request";
              const listingDuration = listing.duration || "Enquiry based";
              const listingSummary =
                listing.summary ||
                "A live operator listing that travellers can open to view details and enquire.";

              return (
                <article key={listing.id} className="lp-listing-card" data-lp-reveal>
                  <Link
                    href={listing.listingHref}
                    className="lp-listing-image"
                    aria-label={`View details for ${listing.title}`}
                  >
                    {listing.imageUrl ? (
                      <Image
                        fill
                        alt={listing.title}
                        unoptimized={listing.imageUrl.startsWith("data:") || listing.imageUrl.startsWith("blob:")}
                        sizes="(max-width: 1024px) 100vw, 33vw"
                        src={listing.imageUrl}
                      />
                    ) : (
                      <div className="lp-listing-fallback">
                        <p className="lp-listing-label">Listing</p>
                        <p className="lp-listing-fallback-title">{listing.title}</p>
                        <p className="lp-listing-fallback-copy">
                          This listing is ready for enquiry and currently has no cover image.
                        </p>
                      </div>
                    )}
                  </Link>

                  <div className="lp-listing-body">
                    <p className="lp-listing-meta">
                      {listingLocation}
                      <span>·</span>
                      {listing.operatorName || "Tour ConnecTT"}
                    </p>
                    <h3>{listing.title}</h3>
                    <p className="lp-listing-copy">{listingSummary}</p>

                    <div className="lp-listing-pills">
                      <span>{listingDuration}</span>
                      <span>{listing.price || "Enquiry based"}</span>
                    </div>

                    <div className="lp-listing-actions">
                      <Button href={listing.listingHref} variant="primary" className="btn-sm">
                        Enquire now
                      </Button>
                      <Button href={listing.listingHref} variant="outline" className="btn-sm">
                        View Details
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="lp-empty-card">
              <p className="lp-section-eyebrow">Featured listings</p>
              <h3>No live listings are available yet.</h3>
              <p>
                The landing page will automatically surface operator listings here as soon as they are available.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="lp-section lp-testimonials" aria-labelledby="testimonials" data-lp-reveal>
        <div className="lp-section-head" data-lp-reveal>
          <div>
            <p className="lp-section-eyebrow">Traveller trust</p>
            <h2 id="testimonials">Loved by discerning travellers worldwide.</h2>
          </div>

          <div className="lp-rating">
            <strong>{reviewSummary ? formatRating(reviewSummary.averageRating) : "4.9"}</strong>
            <span>/5</span>
            <small>
              {reviewSummary
                ? `Based on ${reviewSummary.reviewCount.toLocaleString()} verified reviews`
                : "Based on 126+ verified reviews"}
            </small>
          </div>
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

    </main>
  );
}
