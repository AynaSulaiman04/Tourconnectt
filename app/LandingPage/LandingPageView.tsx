import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AnimatedHeroHeadline } from "@/components/ui/animated-hero";
import { LandingImageSlideshow } from "./LandingImageSlideshow";
import { LandingScrollReveal } from "./LandingScrollReveal";
import { NewsletterForm } from "./newsletter-form";
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
  siteContent: SiteContent;
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
];

function formatRating(value: number) {
  return value.toFixed(1);
}

function resolveListings(listings: LandingListingCard[]) {
  return listings.slice(0, 3);
}

function resolveTestimonials(testimonials: LandingTestimonial[]) {
  return testimonials.length ? testimonials : fallbackTestimonials;
}

export function LandingPageView({ listings, testimonials, reviewSummary, showcaseImages, siteContent }: LandingPageViewProps) {
  const featuredListings = resolveListings(listings);
  const testimonialsToRender = resolveTestimonials(testimonials);
  const hasListings = featuredListings.length > 0;
  const slideshowImages = [...new Set(showcaseImages.map((image) => image.trim()).filter((image) => image.length > 0))];

  return (
    <main className="lp-page">
      <LandingScrollReveal />

      <section className="lp-hero">
        <div className="lp-hero-inner" data-lp-reveal>
          <AnimatedHeroHeadline />

          <form className="lp-search-card" action="/Inquiry" method="get">
            <label className="lp-field">
              <span className="material-symbols-outlined lp-field-icon" aria-hidden="true">
                location_on
              </span>
              <span className="lp-field-label">Destination / Where to?</span>
              <input name="destination" type="text" placeholder="Where to?" required />
            </label>
            <div className="lp-field lp-field-dates">
              <span className="material-symbols-outlined lp-field-icon" aria-hidden="true">
                calendar_month
              </span>
              <span className="lp-field-label">Dates / Select dates</span>
              <div className="lp-date-grid">
                <input name="preferred_start_date" type="date" aria-label="Start date" required />
                <input name="preferred_end_date" type="date" aria-label="End date" required />
              </div>
            </div>
            <label className="lp-field">
              <span className="material-symbols-outlined lp-field-icon" aria-hidden="true">
                people
              </span>
              <span className="lp-field-label">Number of guests</span>
              <input name="guests" type="number" min="1" placeholder="2 guests" required />
            </label>
            <label className="lp-field">
              <span className="material-symbols-outlined lp-field-icon" aria-hidden="true">
                travel_explore
              </span>
              <span className="lp-field-label">Activities</span>
              <input name="activities" type="text" placeholder="Any experience" />
            </label>

            <Button type="submit" variant="outline" className="lp-search-submit btn-sm">
              Inquire Now
            </Button>
          </form>

          <div className="lp-hero-actions">
            <Button href="/SignUp" variant="outline" className="btn-sm lp-register-btn">
              Register as Traveller
            </Button>
          </div>
        </div>
      </section>

      <div data-lp-reveal>
        <LandingImageSlideshow images={slideshowImages} />
      </div>

      <section className="lp-section" aria-labelledby="featured-listings" data-lp-reveal>
        <div className="lp-section-head" data-lp-reveal>
          <div>
            <p className="lp-section-eyebrow">Handpicked experiences</p>
            <h2 id="featured-listings">Featured listings</h2>
          </div>

          <Button href="/Inquiry" variant="outline" className="btn-sm">
            View All Listings
          </Button>
        </div>

        <div className="lp-listings-grid">
          {hasListings ? (
            featuredListings.map((listing) => {
              const listingLocation = listing.location || listing.country || "Location on request";
              const listingDuration = listing.duration || "Inquiry based";
              const listingSummary =
                listing.summary ||
                "A live operator listing that travelers can open to view details and inquire.";

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
                        quality={100}
                        unoptimized
                        sizes="(max-width: 1024px) 100vw, 33vw"
                        src={listing.imageUrl}
                      />
                    ) : (
                      <div className="lp-listing-fallback">
                        <p className="lp-listing-label">Listing</p>
                        <p className="lp-listing-fallback-title">{listing.title}</p>
                        <p className="lp-listing-fallback-copy">
                          This listing is ready for inquiry and currently has no cover image.
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
                      <span>{listing.price || "Inquiry based"}</span>
                    </div>

                    <div className="lp-listing-actions">
                      <Button href={listing.listingHref} variant="primary" className="btn-sm">
                        Inquire Now
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
            <p className="lp-section-eyebrow">Traveler trust</p>
            <h2 id="testimonials">Loved by discerning travelers worldwide.</h2>
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
                  <Image className="lp-avatar" alt={item.name} width={40} height={40} src={item.avatarUrl} unoptimized />
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

      <footer className="lp-footer" data-lp-reveal>
        <div className="lp-footer-main">
          <div className="lp-footer-brand">
            <Link href="/LandingPage" className="lp-footer-logo" aria-label="Tour ConnecTT home">
              <Image alt="Tour ConnecTT" className="lp-footer-logo-image" width={620} height={180} src="/branding/tourconnecttt-logo.png" />
            </Link>
            <p className="lp-footer-description">
              {siteContent.footerDescription}
            </p>
          </div>

          <div className="lp-footer-column">
            <h3>Platform</h3>
            <Link href="/HowItWorks">How it works</Link>
            <Link href="/Inquiry">Live listings</Link>
            <Link href="/ConciergeChat">Concierge</Link>
          </div>

          <div className="lp-footer-column">
            <h3>Company</h3>
            <Link href="/AboutUs">About us</Link>
            <Link href="/Partners">Our partners</Link>
            <Link href="/Careers">Careers</Link>
          </div>

          <div className="lp-footer-column">
            <h3>Support</h3>
            <Link href="/HelpCenter">Help center</Link>
            <Link href="/TermsOfService">Terms of service</Link>
            <Link href="/PrivacyPolicy">Privacy policy</Link>
            <Link href="/ContactUs">Contact us</Link>
          </div>

          <div className="lp-footer-column">
            <h3>Stay inspired</h3>
            <p>{siteContent.footerDescription}</p>

            <NewsletterForm />
          </div>
        </div>

        <div className="lp-footer-bottom">
          <p>&copy; 2026 TOURCONNECTT. ALL RIGHTS RESERVED.</p>

          <div className="lp-footer-bottom-links">
            <Link href="/PrivacyPolicy">Privacy</Link>
            <Link href="/TermsOfService">Terms</Link>
            <div className="lp-footer-socials" aria-label="Social links">
              <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram">
                ig
              </a>
              <a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook">
                f
              </a>
              <a href="https://www.x.com/" target="_blank" rel="noreferrer" aria-label="X">
                x
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
