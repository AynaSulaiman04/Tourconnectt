"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

type AnimatedHeroHeadlineProps = {
  eyebrow?: string;
  prefix?: string;
  phrases?: string[];
  description?: string;
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
}: AnimatedHeroHeadlineProps) {
  const shouldReduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion || phrases.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % phrases.length);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [phrases.length, shouldReduceMotion]);

  const normalizedIndex = phrases.length ? activeIndex % phrases.length : 0;
  const currentPhrase = phrases[normalizedIndex] ?? defaultPhrases[0];

  return (
    <div className="lp-animated-hero">
      <p className="lp-eyebrow">{eyebrow}</p>
      <h1 className="lp-title lp-animated-title">
        <span className="lp-title-prefix">{prefix}</span>
        <span className="lp-title-animated" aria-hidden="true">
          {shouldReduceMotion ? (
            <span className="lp-title-animated-static">{currentPhrase}</span>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={currentPhrase}
                className="lp-title-animated-phrase"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                {currentPhrase}
              </motion.span>
            </AnimatePresence>
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
