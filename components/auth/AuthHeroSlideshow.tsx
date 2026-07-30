"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { shouldServeImageUnoptimized } from "@/lib/landing-slideshow-images";

const SLIDE_INTERVAL_MS = 4500;

type AuthHeroSlideshowProps = {
  heroTitle: string;
  images: string[];
};

export function AuthHeroSlideshow({ heroTitle, images }: AuthHeroSlideshowProps) {
  const safeImages = useMemo(() => images.filter(Boolean), [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedIndex = safeImages.length ? activeIndex % safeImages.length : 0;

  useEffect(() => {
    if (!safeImages.length) {
      return;
    }

    const preloadIndexes = new Set([
      normalizedIndex,
      (normalizedIndex + 1) % safeImages.length,
    ]);

    preloadIndexes.forEach((index) => {
      const imageUrl = safeImages[index];
      if (!imageUrl) {
        return;
      }

      const preload = new window.Image();
      preload.decoding = "async";
      preload.src = imageUrl;
    });
  }, [normalizedIndex, safeImages]);

  useEffect(() => {
    if (safeImages.length < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % safeImages.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [safeImages.length]);

  return (
    <section aria-hidden="true" className="auth-hero">
      <div className="auth-hero-frame">
        {safeImages.map((image, index) => (
          <div
            key={image}
            className={`auth-hero-slide ${index === normalizedIndex ? "is-active" : ""}`}
            aria-hidden={index !== normalizedIndex}
          >
            <Image
              fill
              alt=""
              className="auth-hero-image"
              priority={index === 0}
              quality={92}
              sizes="(max-width: 1024px) 100vw, 50vw"
              src={image}
              loading={index <= 1 ? "eager" : "lazy"}
              unoptimized={shouldServeImageUnoptimized(image)}
            />
          </div>
        ))}
      </div>

      <div className="auth-hero-gradient" />
      <div className="auth-hero-brand">
        <span className="auth-hero-brand-text">Tour ConnecTT</span>
      </div>
      <div className="auth-hero-copy">
        <h2>{heroTitle}</h2>
        <div className="auth-hero-copy-line" />
      </div>
    </section>
  );
}
