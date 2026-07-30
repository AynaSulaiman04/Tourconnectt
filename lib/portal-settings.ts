import type { SiteContent } from "@/lib/site-content";

export const DEFAULT_PORTAL_SETTINGS = {
  slideshowIntervalMs: 2000,
  heroRotationMs: 2000,
  notificationPollSeconds: 120,
} as const;

export const DEFAULT_HERO_CONTENT = {
  heroEyebrow: "Curated journeys. Meaningful connections.",
  heroPrefix: "Extraordinary places.",
  heroPhrases: [
    "Curated for you.",
    "Handpicked for you.",
    "Designed around you.",
    "Connected with care.",
    "Crafted for arrival.",
  ].join("\n"),
  heroDescription: "Bespoke itineraries, handpicked stays, and seamless experiences crafted around you.",
} as const;

export function parseHeroPhrases(value: string) {
  return value
    .split(/\r?\n/)
    .map((phrase) => phrase.trim())
    .filter(Boolean);
}

export function getPortalSettingsFromContent(content: SiteContent) {
  return {
    slideshowIntervalMs: content.slideshowIntervalMs,
    heroRotationMs: content.heroRotationMs,
    notificationPollSeconds: content.notificationPollSeconds,
  };
}

export function getHeroContentFromSiteContent(content: SiteContent) {
  return {
    eyebrow: content.heroEyebrow,
    prefix: content.heroPrefix,
    phrases: parseHeroPhrases(content.heroPhrases),
    description: content.heroDescription,
    rotationIntervalMs: content.heroRotationMs,
  };
}
