import "server-only";

const MEBIBYTE = 1024 * 1024;

export const MAX_LISTING_IMAGE_BYTES = 2 * MEBIBYTE;
export const MAX_LISTING_REQUEST_BYTES = 7 * MEBIBYTE;

const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_LISTING_IMAGE_BYTES / 3);
const MAX_DATA_URL_LENGTH = MAX_BASE64_LENGTH + 40;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DRAFT_PATTERN =
  /^local-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEXT_LIMITS = {
  title: 160,
  location: 180,
  country: 100,
  duration: 80,
  summary: 5_000,
  category: 120,
  price: 80,
  availability: 20,
  itinerary: 5_000,
  inclusions: 5_000,
  exclusions: 5_000,
  contact_name: 160,
  contact_email: 254,
  contact_phone: 50,
} as const;

const ALLOWED_FIELDS = new Set([
  "mode",
  "draft_id",
  "published_listing_id",
  "title",
  "location",
  "country",
  "duration",
  "summary",
  "category",
  "price",
  "availability",
  "capacity",
  "itinerary",
  "inclusions",
  "exclusions",
  "contact_name",
  "contact_email",
  "contact_phone",
  "image_url",
  "image_base64",
  "clear_image",
]);

const ALLOWED_AVAILABILITY = new Set(["morning", "afternoon", "evening", "flexible"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ListingTextField = keyof typeof TEXT_LIMITS;

export type ValidatedOperatorListingInput = {
  mode: "save" | "publish";
  draftId: string | null;
  publishedListingId: string | null;
  clearImage: boolean;
  imageBase64: string | null;
  imageUrl: string | null;
  values: Record<ListingTextField, string | null> & {
    capacity: number | null;
  };
};

export class OperatorListingInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OperatorListingInputError";
    this.status = status;
  }
}

function getSingleString(formData: FormData, field: string) {
  const values = formData.getAll(field);

  if (values.length > 1) {
    throw new OperatorListingInputError(`Only one ${field.replaceAll("_", " ")} value is allowed.`);
  }

  const value = values[0];

  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new OperatorListingInputError(`${field.replaceAll("_", " ")} must be text.`);
  }

  return value.trim();
}

function getBoundedText(formData: FormData, field: ListingTextField) {
  const value = getSingleString(formData, field);

  if (!value) {
    return null;
  }

  if (value.length > TEXT_LIMITS[field]) {
    throw new OperatorListingInputError(
      `${field.replaceAll("_", " ")} is limited to ${TEXT_LIMITS[field].toLocaleString("en-US")} characters.`,
    );
  }

  return value;
}

function hasBytes(bytes: Buffer, expected: number[], offset = 0) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function hasExpectedImageSignature(bytes: Buffer, mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return bytes.length >= 3 && hasBytes(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return bytes.length >= 8 && hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return (
        bytes.length >= 12 &&
        hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      );
    default:
      return false;
  }
}

function validateBase64Image(value: string) {
  if (value.length > MAX_DATA_URL_LENGTH) {
    throw new OperatorListingInputError("Cover image must be 2MB or smaller.");
  }

  const separatorIndex = value.indexOf(",");

  if (separatorIndex < 0) {
    throw new OperatorListingInputError("Cover image data is malformed.");
  }

  const header = value.slice(0, separatorIndex);
  const encoded = value.slice(separatorIndex + 1);
  const headerMatch = /^data:(image\/(?:jpeg|png|webp));base64$/i.exec(header);
  const mimeType = headerMatch?.[1]?.toLowerCase() ?? null;

  if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new OperatorListingInputError("Upload a JPG, PNG, or WEBP cover image.");
  }

  if (
    !encoded ||
    encoded.length > MAX_BASE64_LENGTH ||
    encoded.length % 4 !== 0 ||
    !/^[a-z0-9+/]+={0,2}$/i.test(encoded)
  ) {
    throw new OperatorListingInputError("Cover image data is malformed.");
  }

  const bytes = Buffer.from(encoded, "base64");
  const canonicalEncoded = bytes.toString("base64");

  if (
    bytes.length === 0 ||
    bytes.length > MAX_LISTING_IMAGE_BYTES ||
    canonicalEncoded !== encoded ||
    !hasExpectedImageSignature(bytes, mimeType)
  ) {
    throw new OperatorListingInputError(
      bytes.length > MAX_LISTING_IMAGE_BYTES
        ? "Cover image must be 2MB or smaller."
        : "Cover image contents do not match the selected file type.",
    );
  }

  return `data:${mimeType};base64,${encoded}`;
}

function validateRemoteImageUrl(value: string) {
  if (value.length > 2_048) {
    throw new OperatorListingInputError("Cover image URL is too long.");
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new OperatorListingInputError("Cover image URL is invalid.");
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new OperatorListingInputError("Cover image URL must use HTTPS.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let isPublicSupabaseImage = false;

  if (supabaseUrl) {
    try {
      const configuredSupabaseUrl = new URL(supabaseUrl);
      isPublicSupabaseImage =
        parsed.origin === configuredSupabaseUrl.origin &&
        parsed.pathname.startsWith("/storage/v1/object/public/");
    } catch {
      isPublicSupabaseImage = false;
    }
  }

  if (
    parsed.hostname !== "images.unsplash.com" &&
    parsed.hostname !== "lh3.googleusercontent.com" &&
    !isPublicSupabaseImage
  ) {
    throw new OperatorListingInputError(
      "Cover image URL must use an approved image host. Upload the image instead.",
    );
  }

  return parsed.toString();
}

function parseCapacity(formData: FormData) {
  const value = getSingleString(formData, "capacity");

  if (!value) {
    return null;
  }

  if (!/^\d{1,6}$/.test(value)) {
    throw new OperatorListingInputError("Capacity must be a whole number.");
  }

  const capacity = Number(value);

  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100_000) {
    throw new OperatorListingInputError("Capacity must be between 1 and 100,000.");
  }

  return capacity;
}

async function readBoundedFormData(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new OperatorListingInputError("Listing requests must use form data.", 415);
  }

  const declaredLength = request.headers.get("content-length");

  if (declaredLength) {
    const parsedLength = Number(declaredLength);

    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new OperatorListingInputError("Listing request size is invalid.");
    }

    if (parsedLength > MAX_LISTING_REQUEST_BYTES) {
      throw new OperatorListingInputError("Listing request is too large.", 413);
    }
  }

  if (!request.body) {
    throw new OperatorListingInputError("Listing request is empty.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_LISTING_REQUEST_BYTES) {
        await reader.cancel();
        throw new OperatorListingInputError("Listing request is too large.", 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Response(body, {
      headers: {
        "content-type": contentType,
      },
    }).formData();
  } catch {
    throw new OperatorListingInputError("Listing form data is malformed.");
  }
}

export async function readValidatedOperatorListingInput(
  request: Request,
): Promise<ValidatedOperatorListingInput> {
  const formData = await readBoundedFormData(request);

  for (const field of formData.keys()) {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new OperatorListingInputError(`Unsupported listing field: ${field}.`);
    }
  }

  const modeValue = getSingleString(formData, "mode") || "save";

  if (modeValue !== "save" && modeValue !== "publish") {
    throw new OperatorListingInputError("Listing mode must be save or publish.");
  }

  const draftId = getSingleString(formData, "draft_id");

  if (draftId && !UUID_PATTERN.test(draftId) && !LOCAL_DRAFT_PATTERN.test(draftId)) {
    throw new OperatorListingInputError("Draft identifier is invalid.");
  }

  const publishedListingId = getSingleString(formData, "published_listing_id");

  if (publishedListingId && !UUID_PATTERN.test(publishedListingId)) {
    throw new OperatorListingInputError("Published listing identifier is invalid.");
  }

  const clearImageValue = getSingleString(formData, "clear_image");

  if (clearImageValue && clearImageValue !== "1") {
    throw new OperatorListingInputError("Image removal value is invalid.");
  }

  const values = {
    title: getBoundedText(formData, "title"),
    location: getBoundedText(formData, "location"),
    country: getBoundedText(formData, "country"),
    duration: getBoundedText(formData, "duration"),
    summary: getBoundedText(formData, "summary"),
    category: getBoundedText(formData, "category"),
    price: getBoundedText(formData, "price"),
    availability: getBoundedText(formData, "availability"),
    capacity: parseCapacity(formData),
    itinerary: getBoundedText(formData, "itinerary"),
    inclusions: getBoundedText(formData, "inclusions"),
    exclusions: getBoundedText(formData, "exclusions"),
    contact_name: getBoundedText(formData, "contact_name"),
    contact_email: getBoundedText(formData, "contact_email"),
    contact_phone: getBoundedText(formData, "contact_phone"),
  };

  if (values.availability && !ALLOWED_AVAILABILITY.has(values.availability)) {
    throw new OperatorListingInputError("Availability value is invalid.");
  }

  if (values.contact_email && !EMAIL_PATTERN.test(values.contact_email)) {
    throw new OperatorListingInputError("Contact email is invalid.");
  }

  const imageBase64Value = getSingleString(formData, "image_base64");
  const imageUrlValue = getSingleString(formData, "image_url");
  let imageBase64 = imageBase64Value ? validateBase64Image(imageBase64Value) : null;
  let imageUrl: string | null = null;

  if (imageUrlValue?.toLowerCase().startsWith("data:")) {
    const imageFromLegacyUrlField = validateBase64Image(imageUrlValue);

    if (imageBase64 && imageBase64 !== imageFromLegacyUrlField) {
      throw new OperatorListingInputError("Only one cover image may be submitted.");
    }

    imageBase64 = imageFromLegacyUrlField;
  } else if (imageUrlValue) {
    imageUrl = validateRemoteImageUrl(imageUrlValue);
  }

  if (imageBase64 && imageUrl) {
    throw new OperatorListingInputError("Choose either an uploaded cover image or a remote image URL.");
  }

  return {
    mode: modeValue,
    draftId: draftId || null,
    publishedListingId: publishedListingId || null,
    clearImage: clearImageValue === "1",
    imageBase64,
    imageUrl,
    values,
  };
}
