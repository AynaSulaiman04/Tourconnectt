"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

type LandingHeroVideoProps = {
  src: string;
  contentType?: string | null;
};

const SMALL_SCREEN_QUERY = "(max-width: 900px)";

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

function getConnection(): NetworkInformation | undefined {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

/**
 * Whether this visitor should be served a multi-megabyte decorative video.
 *
 * Read through `useSyncExternalStore` rather than an effect: these are external
 * browser values, the server has no answer for them, and syncing them into
 * state from an effect causes a second render pass on every visit.
 */
function subscribeToViewport(onChange: () => void) {
  const media = window.matchMedia(SMALL_SCREEN_QUERY);
  media.addEventListener("change", onChange);

  // Save-Data and effectiveType can change mid-session when a phone moves
  // between networks.
  const connection = getConnection() as (NetworkInformation & EventTarget) | undefined;
  connection?.addEventListener?.("change", onChange);

  return () => {
    media.removeEventListener("change", onChange);
    connection?.removeEventListener?.("change", onChange);
  };
}

function getVideoAllowed() {
  const connection = getConnection();
  const saveData = connection?.saveData === true;
  const slowNetwork = /(^|-)(2g|slow-2g)$/.test(connection?.effectiveType ?? "");
  const smallScreen = window.matchMedia(SMALL_SCREEN_QUERY).matches;

  return !saveData && !slowNetwork && !smallScreen;
}

/** The server cannot know the screen or connection, so it assumes the cheap path. */
function getVideoAllowedOnServer() {
  return false;
}

/**
 * Background layer for the landing hero. Muted autoplay is the only form
 * browsers allow without a gesture, and `playsInline` stops iOS Safari from
 * taking the video fullscreen. If autoplay is still refused the hero simply
 * shows the first frame, so the section never looks broken.
 *
 * A decorative background loop is not worth megabytes on a phone, and most of
 * our visitors are on one, often roaming. Small screens and any browser
 * reporting Save-Data or a 2G-class connection get a painted backdrop instead,
 * and never request the video at all.
 */
export function LandingHeroVideo({ src, contentType }: LandingHeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const allowed = useSyncExternalStore(
    subscribeToViewport,
    getVideoAllowed,
    getVideoAllowedOnServer,
  );

  useEffect(() => {
    if (!allowed) {
      return;
    }

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
  }, [src, allowed]);

  if (!allowed) {
    // The hero card is styled for a dark video backdrop, so paint one rather
    // than leaving it on the cream page background.
    return (
      <div className="lp-hero-video-layer lp-hero-video-fallback" aria-hidden="true">
        <div className="lp-hero-video-scrim" />
      </div>
    );
  }

  return (
    <div className="lp-hero-video-layer" aria-hidden="true">
      <video
        ref={videoRef}
        className="lp-hero-video"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        tabIndex={-1}
      >
        <source src={src} type={contentType ?? undefined} />
      </video>
      <div className="lp-hero-video-scrim" />
    </div>
  );
}
