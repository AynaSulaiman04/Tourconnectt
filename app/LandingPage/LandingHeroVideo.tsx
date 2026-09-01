"use client";

import { useEffect, useRef } from "react";

type LandingHeroVideoProps = {
  src: string;
  contentType?: string | null;
};

/**
 * Background layer for the landing hero. Muted autoplay is the only form
 * browsers allow without a gesture, and `playsInline` stops iOS Safari from
 * taking the video fullscreen. If autoplay is still refused the hero simply
 * shows the first frame, so the section never looks broken.
 */
export function LandingHeroVideo({ src, contentType }: LandingHeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function applyMotionPreference() {
      if (!videoRef.current) {
        return;
      }

      if (reducedMotion.matches) {
        videoRef.current.pause();
        return;
      }

      // A rejected play() is expected on some mobile power-saving modes.
      void videoRef.current.play().catch(() => {});
    }

    applyMotionPreference();
    reducedMotion.addEventListener("change", applyMotionPreference);

    return () => {
      reducedMotion.removeEventListener("change", applyMotionPreference);
    };
  }, [src]);

  return (
    <div className="lp-hero-video-layer" aria-hidden="true">
      <video
        ref={videoRef}
        className="lp-hero-video"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
      >
        <source src={src} type={contentType ?? undefined} />
      </video>
      <div className="lp-hero-video-scrim" />
    </div>
  );
}
