const SUPABASE_UPLOAD_PREFIX =
  /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i;

export const DEFAULT_LANDING_SLIDESHOW_IMAGES = [
  "/landing/slideshow/dji_0024.jpg",
  "/landing/slideshow/dji_0047.jpg",
  "/landing/slideshow/dji_0069.jpg",
  "/landing/slideshow/dji_0116.jpg",
  "/landing/slideshow/dji_0257.jpg",
  "/landing/slideshow/dji_0267.jpg",
  "/landing/slideshow/dji_0394.jpg",
  "/landing/slideshow/dji_0398.jpg",
  "/landing/slideshow/dji_0399.jpg",
  "/landing/slideshow/dji_0406.jpg",
  "/landing/slideshow/dji_0408.jpg",
  "/landing/slideshow/dji_0410.jpg",
  "/landing/slideshow/dji_0628.jpg",
  "/landing/slideshow/dji_0637.jpg",
  "/landing/slideshow/dji_0648.jpg",
  "/landing/slideshow/dji_0651.jpg",
  "/landing/slideshow/dji_0660.jpg",
  "/landing/slideshow/dji_0666.jpg",
  "/landing/slideshow/dji_0689.jpg",
  "/landing/slideshow/dji_0691.jpg",
  "/landing/slideshow/dji_0695.jpg",
  "/landing/slideshow/dji_0697.jpg",
  "/landing/slideshow/dji_fly_20250707_144340_42_1751934715177_photo_optimized.jpg",
  "/landing/slideshow/dji_fly_20250707_154956_66_1751934651621_photo_optimized.jpg",
  "/landing/slideshow/dji_fly_20250707_155000_67_1751934649325_photo_optimized.jpg",
  "/landing/slideshow/dji_fly_20260605_164028_989_1780783962513_photo_optimized.jpg",
  "/landing/slideshow/dji_fly_20260605_164116_994_1780783957520_photo_optimized.jpg",
  "/landing/slideshow/dji_fly_20260605_170110_32_1780783854540_photo_optimized.jpg",
  "/landing/slideshow/dji_fly_20260605_170130_33_1780783853629_photo_optimized.jpg",
  "/landing/slideshow/dji_fly_20260605_170146_36_1780783850989_photo_optimized.jpg",
  "/landing/slideshow/20250107_133530.jpg",
  "/landing/slideshow/20250618_181026.jpg",
  "/landing/slideshow/20250710_160750.jpg",
  "/landing/slideshow/20251222_133750.jpg",
  "/landing/slideshow/20251223_162857.jpg",
  "/landing/slideshow/20251223_162906.jpg",
  "/landing/slideshow/20251230_155042.jpg",
  "/landing/slideshow/20260120_063702.jpg",
  "/landing/slideshow/20260120_094637.jpg",
  "/landing/slideshow/20260120_142255.jpg",
  "/landing/slideshow/20260127_121157.jpg",
  "/landing/slideshow/20260127_154542.jpg",
  "/landing/slideshow/20260208_175512.jpg",
  "/landing/slideshow/20260209_115739.jpg",
  "/landing/slideshow/20260215_103302.jpg",
  "/landing/slideshow/whatsapp-image-2025-10-16-at-12.38.38_34c4c41f.jpg",
  "/landing/slideshow/whatsapp-image-2025-10-16-at-12.38.39_ce5b9484.jpg",
  "/landing/slideshow/whatsapp-image-2025-10-16-at-12.38.39_d56104d5.jpg",
];

const EXCLUDED_SLIDESHOW_PATTERNS = [
  "02_12_05-am-8-",
  "02_12_05_am_8_",
  "02-tobago-sunrise",
  "02-sunrise",
  "04-heritage-tree",
  "heritage-tree",
];

export function getSlideshowImageKey(imageUrl: string) {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    return "";
  }

  let pathname = trimmed;

  try {
    pathname = new URL(trimmed, "http://localhost").pathname;
  } catch {
    pathname = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  }

  const fileName = decodeURIComponent(pathname.split("/").pop() ?? pathname).toLowerCase();
  const uploadMatch = fileName.match(SUPABASE_UPLOAD_PREFIX);

  if (uploadMatch?.[1]) {
    return uploadMatch[1];
  }

  return fileName;
}

export function isExcludedSlideshowImage(imageUrl: string) {
  const key = getSlideshowImageKey(imageUrl);

  return EXCLUDED_SLIDESHOW_PATTERNS.some((pattern) => key.includes(pattern));
}

export function dedupeSlideshowImageUrls(imageUrls: string[]) {
  const seenKeys = new Set<string>();
  const uniqueImages: string[] = [];

  for (const imageUrl of imageUrls) {
    const trimmed = imageUrl.trim();
    if (!trimmed || isExcludedSlideshowImage(trimmed)) {
      continue;
    }

    const dedupeKey = getSlideshowImageKey(trimmed);
    if (!dedupeKey || seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    uniqueImages.push(trimmed);
  }

  return uniqueImages;
}

/**
 * Only inline sources genuinely cannot be optimized. Supabase public storage
 * and local `/landing/` files are both allowed by `images.remotePatterns`, so
 * routing them through the optimizer is what produces a responsive srcset and
 * a sharp image on 4K displays. Bypassing it shipped the raw multi-megabyte
 * original to every device at one fixed size.
 */
export function shouldServeImageUnoptimized(src: string) {
  const trimmed = src.trim();
  return trimmed.startsWith("data:") || trimmed.startsWith("blob:");
}
