"use client";

import { useEffect, useState } from "react";

type AnimatedHeroHeadlineProps = {
  eyebrow?: string;
  prefix?: string;
  phrases?: string[];
  description?: string;
  rotationIntervalMs?: number;
};

const defaultPhrases = [
  "Curated for you.",
  "Handpicked for you.",
  "Designed around you.",
  "Connected with care.",
  "Crafted for arrival.",
];

export function AnimatedHeroHeadline({
  eyebrow = "Curated journeys. Meaningful connections.",
  prefix = "Extraordinary places.",
  phrases = defaultPhrases,
  description = "Bespoke itineraries, handpicked stays, and seamless experiences crafted around you.",
  rotationIntervalMs = 2000,
}: AnimatedHeroHeadlineProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || phrases.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % phrases.length);
    }, rotationIntervalMs);

    return () => window.clearInterval(interval);
  }, [phrases.length, prefersReducedMotion, rotationIntervalMs]);

  const normalizedIndex = phrases.length ? activeIndex % phrases.length : 0;
  const currentPhrase = phrases[normalizedIndex] ?? defaultPhrases[0];

  return (
    <div className="lp-animated-hero">
      <p className="lp-eyebrow">{eyebrow}</p>
      <h1 className="lp-title lp-animated-title">
        <span className="lp-title-prefix">{prefix}</span>
        <span className="lp-title-animated" aria-hidden="true">
          {prefersReducedMotion ? (
            <span className="lp-title-animated-static">{currentPhrase}</span>
          ) : (
            <span key={currentPhrase} className="lp-title-animated-phrase">
              {currentPhrase}
            </span>
          )}
        </span>
      </h1>
      {description ? <p className="lp-copy">{description}</p> : null}
      <span className="sr-only">
        {prefix} {currentPhrase}
      </span>
    </div>
  );
}
