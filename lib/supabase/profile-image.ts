import { normalizeMediaSource } from "./media";

export function normalizeProfileImageSource(
  value: string | null | undefined,
  mimeType = "image/jpeg",
) {
  return normalizeMediaSource(value, mimeType);
}
