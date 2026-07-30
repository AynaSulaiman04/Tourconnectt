const SUPABASE_UPLOAD_PREFIX =
  /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i;

export const DEFAULT_LANDING_SLIDESHOW_IMAGES = [
  "/landing/slideshow/01-tobago-bay.webp",
  "/landing/slideshow/03-rainforest-waterfall.webp",
  "/landing/slideshow/05-beach-sunset.webp",
  "/landing/slideshow/06-leatherback-turtles.webp",
  "/landing/slideshow/07-pigeon-point.webp",
  "/landing/slideshow/08-rainbow-bay.webp",
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

export function shouldServeImageUnoptimized(src: string) {
  const trimmed = src.trim();
  return (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/landing/") ||
    trimmed.includes("/storage/v1/object/public/")
  );
}
