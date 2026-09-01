"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { dedupeSlideshowImageUrls, shouldServeImageUnoptimized } from "@/lib/landing-slideshow-images";

type LandingImageSlideshowProps = {
  images: string[];
  intervalMs?: number;
};

const DEFAULT_SLIDESHOW_INTERVAL_MS = 2000;

export function LandingImageSlideshow({ images, intervalMs = DEFAULT_SLIDESHOW_INTERVAL_MS }: LandingImageSlideshowProps) {
  const safeImages = useMemo(() => dedupeSlideshowImageUrls(images), [images]);
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
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, safeImages.length]);

  if (!safeImages.length) {
    return (
      <section className="lp-showcase" aria-label="Featured destinations slideshow">
        <div className="lp-showcase-frame lp-showcase-empty">
          <div className="lp-showcase-empty-card">
            <span className="material-symbols-outlined lp-showcase-empty-icon" aria-hidden="true">
              photo_library
            </span>
            <p className="lp-showcase-empty-title">Landing slideshow area</p>
            <p className="lp-showcase-empty-copy">
              Add image URLs in Admin Settings to populate this rotating destination strip.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="lp-showcase" aria-label="Featured destinations slideshow">
      <div className="lp-showcase-frame">
        {safeImages.map((image, index) => (
          <div
            key={image}
            className={`lp-showcase-slide ${index === normalizedIndex ? "is-active" : ""}`}
            aria-hidden={index !== normalizedIndex}
          >
            <Image
              fill
              alt={`Featured Trinidad and Tobago destination ${index + 1}`}
              className="lp-showcase-image"
              priority={index === 0}
              quality={92}
              sizes="(max-width: 768px) 100vw, (max-width: 1440px) 100vw, 1440px"
              src={image}
              loading={index <= 1 ? "eager" : "lazy"}
              unoptimized={shouldServeImageUnoptimized(image)}
            />
          </div>
        ))}
      </div>

      {safeImages.length > 1 ? (
        <div className="lp-showcase-dots">
          {safeImages.map((image, index) => (
            <button
              key={image}
              type="button"
              className={`lp-showcase-dot ${index === normalizedIndex ? "is-active" : ""}`}
              aria-current={index === normalizedIndex ? "true" : undefined}
              aria-label={`Show featured image ${index + 1} of ${safeImages.length}`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
