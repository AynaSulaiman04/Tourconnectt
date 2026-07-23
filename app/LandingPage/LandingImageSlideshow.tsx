"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

type LandingImageSlideshowProps = {
  images: string[];
};

export function LandingImageSlideshow({ images }: LandingImageSlideshowProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeImages = useMemo(
    () => Array.from(new Set(images.map((image) => image.trim()).filter((image) => image.length > 0))),
    [images],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const normalizedIndex = safeImages.length ? activeIndex % safeImages.length : 0;

  useEffect(() => {
    if (safeImages.length < 2 || prefersReducedMotion || isPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % safeImages.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isPaused, prefersReducedMotion, safeImages.length]);

  useEffect(() => {
    if (safeImages.length < 2) {
      return;
    }

    const nextImage = new window.Image();
    nextImage.src = safeImages[(normalizedIndex + 1) % safeImages.length];
  }, [normalizedIndex, safeImages]);

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

  const currentImage = safeImages[normalizedIndex] ?? safeImages[0];

  return (
    <section
      className="lp-showcase"
      aria-label="Featured destinations slideshow"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div className="lp-showcase-frame">
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={currentImage}
            className="lp-showcase-slide"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 1.025 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <Image
              fill
              alt={`Featured Trinidad and Tobago destination ${normalizedIndex + 1}`}
              className="lp-showcase-image"
              priority={normalizedIndex === 0}
              quality={100}
              unoptimized
              sizes="100vw"
              src={currentImage}
            />
          </motion.div>
        </AnimatePresence>
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
