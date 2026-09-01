import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const LANDING_HERO_VIDEO_BUCKET = "landing-hero-video";
export const LANDING_HERO_VIDEO_PREFIX = "admin";
/**
 * Capped by the Supabase project's global upload limit (50 MB on the current
 * plan) — asking for a larger per-bucket limit is rejected outright with
 * "The object exceeded the maximum allowed size". Raise this only after the
 * project's global limit is raised in the Supabase dashboard.
 *
 * A muted 15-30 second 1080p loop compresses to single-digit megabytes, so this
 * is comfortable headroom for a hero background.
 */
export const LANDING_HERO_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const LANDING_HERO_VIDEO_ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export type LandingHeroVideo = {
  name: string;
  path: string;
  publicUrl: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
};

/**
 * Newest first. The upload route keeps only one video, but a listing is still
 * the source of truth so a partially failed cleanup cannot leave the hero
 * pointing at a deleted object.
 */
export async function listLandingHeroVideos(): Promise<LandingHeroVideo[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.storage.from(LANDING_HERO_VIDEO_BUCKET).list(LANDING_HERO_VIDEO_PREFIX, {
    limit: 20,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    // A missing bucket is the normal state before the first upload.
    return [];
  }

  return (data ?? [])
    .filter((item) => typeof item.name === "string" && /\.(mp4|webm|mov)$/i.test(item.name))
    .map((item) => ({
      name: item.name,
      path: `${LANDING_HERO_VIDEO_PREFIX}/${item.name}`,
      publicUrl: admin.storage
        .from(LANDING_HERO_VIDEO_BUCKET)
        .getPublicUrl(`${LANDING_HERO_VIDEO_PREFIX}/${item.name}`).data.publicUrl,
      contentType: (item.metadata?.mimetype as string | undefined) ?? null,
      sizeBytes: (item.metadata?.size as number | undefined) ?? null,
      createdAt: item.created_at ?? null,
    }));
}

async function fetchLandingHeroVideo() {
  const videos = await listLandingHeroVideos();
  return videos[0] ?? null;
}

export const getLandingHeroVideo = unstable_cache(fetchLandingHeroVideo, ["landing-hero-video"], {
  revalidate: 300,
  tags: ["landing-hero-video"],
});
