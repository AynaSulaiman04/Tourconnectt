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

  // Only the outgoing, current, and incoming slides are mounted. Every slide
  // occupies the same absolutely-positioned box, so the browser counts them all
  // as in-viewport and `loading="lazy"` defers nothing -- all 24 full-width
  // images were fetched on load. Keeping the previous one mounted lets the
  // crossfade finish.
  const mounted = useMemo(() => {
    const total = safeImages.length;

    if (total === 0) {
      return new Set<number>();
    }

    return new Set<number>([
      normalizedIndex,
      (normalizedIndex + 1) % total,
      (normalizedIndex - 1 + total) % total,
    ]);
  }, [normalizedIndex, safeImages.length]);

  useEffect(() => {
    if (!safeImages.length) {
      return;
    }

    // Warm only the next slide. Preloading through a bare Image() bypasses the
    // optimizer and fetches the full-size original, so this is deliberately
    // limited to the one frame that is about to appear.
    const nextIndex = (normalizedIndex + 1) % safeImages.length;
    const imageUrl = safeImages[nextIndex];

    if (!imageUrl) {
      return;
    }

    const preload = new window.Image();
    preload.decoding = "async";
    preload.src = imageUrl;
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
        {safeImages.map((image, index) =>
          mounted.has(index) ? (
            <div
              key={image}
              className={`lp-showcase-slide ${index === normalizedIndex ? "is-active" : ""}`}
              aria-hidden={index !== normalizedIndex}
            >
              <Image
                fill
                alt={`Featured Trinidad and Tobago destination ${index + 1}`}
                className="lp-showcase-image"
                quality={75}
                sizes="(max-width: 768px) 100vw, 1600px"
                src={image}
                priority={index === 0}
                unoptimized={shouldServeImageUnoptimized(image)}
              />
            </div>
          ) : null,
        )}
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
