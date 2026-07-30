import "server-only";

import {
  dedupeSlideshowImageUrls,
  DEFAULT_LANDING_SLIDESHOW_IMAGES,
} from "@/lib/landing-slideshow-images";
import { getLandingSlideshowImageUrls } from "@/lib/supabase/analytics";

export const AUTH_HERO_COPY =
  "Discover the people, culture, and coastlines of Trinidad and Tobago.";

const AUTH_HERO_LIMIT = 6;

export function resolveAuthHeroImages(uploadedUrls: string[], limit = AUTH_HERO_LIMIT) {
  const deduped = dedupeSlideshowImageUrls(uploadedUrls);

  if (deduped.length > 0) {
    return deduped.slice(0, limit);
  }

  return DEFAULT_LANDING_SLIDESHOW_IMAGES.slice(0, limit);
}

export async function getAuthHeroImages(limit = AUTH_HERO_LIMIT) {
  const uploaded = await getLandingSlideshowImageUrls();
  return resolveAuthHeroImages(uploaded, limit);
}

export function pickDefaultProfileImage(imagePool: string[], seed?: string | null) {
  if (!imagePool.length) {
    return null;
  }

  if (!seed) {
    return imagePool[0] ?? null;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash + seed.charCodeAt(index)) % imagePool.length;
  }

  return imagePool[hash] ?? imagePool[0] ?? null;
}

export async function getDefaultProfileImageUrl(userId?: string | null) {
  const pool = await getAuthHeroImages(AUTH_HERO_LIMIT);
  return pickDefaultProfileImage(pool, userId);
}
