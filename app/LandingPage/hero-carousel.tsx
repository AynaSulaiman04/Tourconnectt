"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type LandingHeroSlide = {
  id: string;
  imageUrl: string;
  location: string;
  title: string;
  summary: string;
  operatorName: string;
  listingHref: string;
};

export type LandingHeroTrust = {
  averageRating: number;
  reviewCount: number;
} | null;

type HeroCarouselProps = {
  slides: LandingHeroSlide[];
  trustSummary: LandingHeroTrust;
};

export function HeroCarousel({ slides, trustSummary }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const safeSlides = useMemo(() => slides.filter(Boolean), [slides]);

  useEffect(() => {
    if (safeSlides.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % safeSlides.length);
    }, 7200);

    return () => window.clearInterval(interval);
  }, [safeSlides.length]);

  if (!safeSlides.length) {
    return null;
  }

  const normalizedIndex = activeIndex % safeSlides.length;
  const currentSlide = safeSlides[normalizedIndex] ?? safeSlides[0];

  return (
    <section className="hero" id="hero">
      <div className="hero-carousel" aria-label="Featured listings carousel">
        {safeSlides.map((slide, index) => (
          <div key={slide.id} className={`hero-slide ${index === normalizedIndex ? "is-active" : ""}`}>
            <Image
              alt={slide.title}
              className="hero-img"
              loading={index === 0 ? "eager" : "lazy"}
              priority={index === 0}
              fill
              quality={100}
              unoptimized
              sizes="100vw"
              src={slide.imageUrl}
            />
          </div>
        ))}

        <div className="hero-overlay" />
        <div className="hero-warmth" />

        <button
          aria-label="Previous featured listing"
          className="hero-nav hero-nav-left"
          type="button"
          onClick={() => setActiveIndex((current) => (current - 1 + safeSlides.length) % safeSlides.length)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_left
          </span>
        </button>

        <button
          aria-label="Next featured listing"
          className="hero-nav hero-nav-right"
          type="button"
          onClick={() => setActiveIndex((current) => (current + 1) % safeSlides.length)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_right
          </span>
        </button>

        <div className="hero-content">
          <div className="hero-panel">
            <div className="hero-badges">
              <p className="eyebrow">{currentSlide.location}</p>
            </div>

            <h1 className="title">{currentSlide.title}</h1>

            <p className="hero-copy">{currentSlide.summary}</p>

            <div className="hero-cta-row">
              <Link className="hero-button hero-button-primary" href={currentSlide.listingHref}>
                INQUIRE NOW
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
        </div>

        <Link className="hero-compass" href="#map-section" aria-label="Jump to the map section">
          <span aria-hidden="true">N</span>
        </Link>

        {trustSummary ? (
          <Link className="hero-rating-card" href="#trust-section" aria-label="Jump to traveler trust">
            <div>
            <div className="hero-rating-score">
                {trustSummary.reviewCount > 0 ? trustSummary.averageRating.toFixed(1) : "9.8"}
                <small>{trustSummary.reviewCount > 0 ? "/5" : "/10"}</small>
              </div>
              <div className="hero-rating-stars" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => (
                  <span className="material-symbols-outlined" key={`hero-rating-star-${index}`}>
                    star
                  </span>
                ))}
              </div>
              <div className="hero-rating-copy">Traveler rating</div>
            </div>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
