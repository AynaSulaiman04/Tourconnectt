import "server-only";

import { normalizeMediaSource } from "./media";
import { createSupabaseServiceRoleClient } from "./server";
import type { TourListing } from "./inquiry-types";

/**
 * The public detail page for a single experience.
 *
 * `tour_listings` is deliberately thin -- it is the row the catalogue is built
 * from. Everything that makes a listing worth reading (itinerary, inclusions,
 * capacity, who to contact) lives on the operator's draft, so the detail page
 * joins the two. The draft is the operator's working copy, so only the record
 * that actually produced this published listing is read.
 */
export type ListingDetail = TourListing & {
  itinerary: string | null;
  inclusions: string | null;
  exclusions: string | null;
  availability: string | null;
  capacity: number | null;
  operator_email: string | null;
  operator_phone: string | null;
};

const BASE_COLUMNS =
  "id,title,location,country,duration,summary,image_url,image_base64,price,operator_id,operator_name,featured,is_active,status,created_at,updated_at";

const BROWSE_COLUMNS = `${BASE_COLUMNS},island,category,price_currency,price_basis`;

function isMissingRelationError(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "42P01" || error?.message?.includes("Could not find the table");
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.message?.includes("column") ||
        error.message?.includes("schema cache")),
  );
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A cover image may be stored as a URL or as an inline data URL. Unlike the
 * catalogue feed, the detail page renders exactly one listing, so a large
 * inline image is affordable here and is not discarded.
 */
function normalizeImage(imageUrl: string | null, imageBase64: string | null) {
  return normalizeMediaSource(imageUrl) ?? normalizeMediaSource(imageBase64) ?? null;
}

export async function getListingDetail(listingId: string): Promise<ListingDetail | null> {
  if (!listingId) {
    return null;
  }

  try {
    const admin = createSupabaseServiceRoleClient();

    async function selectListing(columns: string) {
      return admin
        .from("tour_listings")
        .select(columns)
        .eq("id", listingId)
        .eq("is_active", true)
        .eq("status", "live")
        .maybeSingle();
    }

    let result = await selectListing(BROWSE_COLUMNS);

    if (result.error && isMissingColumnError(result.error) && !isMissingRelationError(result.error)) {
      result = await selectListing(BASE_COLUMNS);
    }

    if (result.error) {
      if (isMissingRelationError(result.error)) {
        return null;
      }

      throw new Error(result.error.message);
    }

    const row = result.data as (TourListing & { image_base64?: string | null }) | null;

    if (!row) {
      return null;
    }

    const { data: draft } = await admin
      .from("operator_listing_drafts")
      .select("itinerary,inclusions,exclusions,availability,capacity,contact_email,contact_phone,updated_at")
      .eq("published_listing_id", listingId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const draftRow = draft as {
      itinerary: string | null;
      inclusions: string | null;
      exclusions: string | null;
      availability: string | null;
      capacity: number | null;
      contact_email: string | null;
      contact_phone: string | null;
    } | null;

    return {
      ...row,
      island: row.island ?? null,
      category: row.category ?? null,
      price_currency: row.price_currency ?? null,
      price_basis: row.price_basis ?? null,
      image_url: normalizeImage(row.image_url, row.image_base64 ?? null),
      itinerary: normalizeText(draftRow?.itinerary),
      inclusions: normalizeText(draftRow?.inclusions),
      exclusions: normalizeText(draftRow?.exclusions),
      availability: normalizeText(draftRow?.availability),
      capacity: typeof draftRow?.capacity === "number" ? draftRow.capacity : null,
      operator_email: normalizeText(draftRow?.contact_email),
      operator_phone: normalizeText(draftRow?.contact_phone),
    } satisfies ListingDetail;
  } catch (error) {
    console.error("Unable to load listing detail", error);
    return null;
  }
}

/** Ids of every live listing, for generating detail routes. */
export async function getLiveListingIds(): Promise<string[]> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin
      .from("tour_listings")
      .select("id")
      .eq("is_active", true)
      .eq("status", "live");

    if (error) {
      return [];
    }

    return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  } catch {
    return [];
  }
}
