import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { calculateListingCompletion } from "@/lib/operator-listing-completion";
import {
  OperatorListingInputError,
  readValidatedOperatorListingInput,
} from "@/lib/operator-listing-input";
import { getOperatorListingDraftById } from "@/lib/supabase/operator-listings";
import { recordAdminNotifications, recordPlatformNotification } from "@/lib/supabase/notifications";

function isMissingTableOrSchemaError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

function buildSyntheticDraft(
  draftPayload: {
    operator_id: string;
    title: string | null;
    location: string | null;
    country: string | null;
    duration: string | null;
    summary: string | null;
    category: string | null;
    price: string | null;
    availability: string | null;
    capacity: number | null;
    itinerary: string | null;
    inclusions: string | null;
    exclusions: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    image_url: string | null;
    image_base64: string | null;
    is_published: boolean;
    published_listing_id: string | null;
  },
  profileId: string,
  draftId: string | null,
) {
  const now = new Date().toISOString();

  return {
    id: draftId ?? `local-${profileId}`,
    ...draftPayload,
    operator_id: profileId,
    created_at: now,
    updated_at: now,
  };
}

function shouldUseDraftTableFallback(error: { code?: string | null; message?: string | null } | null) {
  return isMissingTableOrSchemaError(error);
}

export async function POST(request: Request) {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile || profileContext.profile.role !== "operator") {
    return NextResponse.json({ ok: false, error: "Operator access required." }, { status: 403 });
  }

  let input;

  try {
    input = await readValidatedOperatorListingInput(request);
  } catch (error) {
    if (error instanceof OperatorListingInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    console.error("Unable to parse operator listing input", error);
    return NextResponse.json(
      { ok: false, error: "We could not read that listing request. Please try again." },
      { status: 400 },
    );
  }

  const { mode, draftId, publishedListingId: requestedPublishedListingId } = input;
  const admin = createSupabaseServiceRoleClient();
  const currentDraft = draftId ? await getOperatorListingDraftById(profileContext.profile.id, draftId) : null;
  let verifiedPublishedListingId = currentDraft?.published_listing_id ?? null;

  if (!verifiedPublishedListingId && requestedPublishedListingId) {
    const { data: ownedListing, error: ownedListingError } = await admin
      .from("tour_listings")
      .select("id")
      .eq("id", requestedPublishedListingId)
      .eq("operator_id", profileContext.profile.id)
      .maybeSingle();

    if (ownedListingError || !ownedListing) {
      return NextResponse.json(
        { ok: false, error: "That published listing is unavailable or is not owned by this account." },
        { status: 403 },
      );
    }

    verifiedPublishedListingId = ownedListing.id;
  }

  const payload = {
    operator_id: profileContext.profile.id,
    ...input.values,
    is_published: false,
    published_listing_id: verifiedPublishedListingId,
  };

  const uploadedImageBase64 = input.clearImage
    ? null
    : input.imageBase64 ?? currentDraft?.image_base64 ?? null;
  const uploadedImageUrl = input.clearImage
    ? null
    : uploadedImageBase64
      ? null
      : input.imageUrl ?? currentDraft?.image_url ?? null;

  const draftPayload = {
    ...payload,
    image_base64: uploadedImageBase64,
    image_url: uploadedImageUrl,
  };

  let draftRecord;
  let draftTableUnavailable = false;

  if (draftId && currentDraft) {
    const { data, error } = await admin
      .from("operator_listing_drafts")
      .update(draftPayload)
      .eq("id", draftId)
      .eq("operator_id", profileContext.profile.id)
      .select(
        "id,operator_id,title,location,country,duration,summary,category,price,availability,capacity,itinerary,inclusions,exclusions,contact_name,contact_email,contact_phone,image_url,image_base64,is_published,published_listing_id,created_at,updated_at",
      )
      .maybeSingle();

    if (error || !data) {
      if (shouldUseDraftTableFallback(error)) {
        draftTableUnavailable = true;
      } else {
        return NextResponse.json(
          { ok: false, error: "We could not update the draft listing. Please try again." },
          { status: 400 },
        );
      }
    } else {
      draftRecord = data;
    }
  } else {
    const { data, error } = await admin
      .from("operator_listing_drafts")
      .insert(draftPayload)
      .select(
        "id,operator_id,title,location,country,duration,summary,category,price,availability,capacity,itinerary,inclusions,exclusions,contact_name,contact_email,contact_phone,image_url,image_base64,is_published,published_listing_id,created_at,updated_at",
      )
      .single();

    if (error || !data) {
      if (shouldUseDraftTableFallback(error)) {
        draftTableUnavailable = true;
      } else {
        return NextResponse.json(
          { ok: false, error: "We could not save the draft listing. Please try again." },
          { status: 400 },
        );
      }
    } else {
      draftRecord = data;
    }
  }

  if (draftTableUnavailable || !draftRecord) {
    draftRecord = buildSyntheticDraft(draftPayload, profileContext.profile.id, draftId);
  }

  const completion = calculateListingCompletion({
    title: draftRecord.title,
    location: draftRecord.location,
    country: draftRecord.country,
    duration: draftRecord.duration,
    summary: draftRecord.summary,
    category: draftRecord.category,
    price: draftRecord.price,
    availability: draftRecord.availability,
    capacity: draftRecord.capacity,
    itinerary: draftRecord.itinerary,
    inclusions: draftRecord.inclusions,
    exclusions: draftRecord.exclusions,
    contact_name: draftRecord.contact_name,
    contact_email: draftRecord.contact_email,
    contact_phone: draftRecord.contact_phone,
    image_url: draftRecord.image_base64 ?? draftRecord.image_url,
  });

  if (mode === "publish") {
    if (completion.percentage < 100) {
      return NextResponse.json(
        { ok: false, error: "Complete every required field before publishing." },
        { status: 400 },
      );
    }

    const publishPayload = {
      title: draftRecord.title ?? "",
      location: draftRecord.location ?? "",
      country: draftRecord.country ?? "",
      duration: draftRecord.duration ?? "",
      summary: draftRecord.summary ?? "",
      image_url: draftRecord.image_base64 ? null : draftRecord.image_url,
      image_base64: draftRecord.image_base64,
      price: draftRecord.price,
      operator_id: profileContext.profile.id,
      operator_name: profileContext.profile.full_name,
      featured: false,
      is_active: false,
      status: "under_review",
    };

    let listingId = draftRecord.published_listing_id;

    if (listingId) {
      const { data: updatedListing, error: updateListingError } = await admin
        .from("tour_listings")
        .update(publishPayload)
        .eq("id", listingId)
        .eq("operator_id", profileContext.profile.id)
        .select("id")
        .maybeSingle();

      if (updateListingError || !updatedListing) {
        return NextResponse.json(
          { ok: false, error: "That published listing is unavailable or is not owned by this account." },
          { status: 403 },
        );
      }
    } else {
      const { data: createdListing, error: insertListingError } = await admin
        .from("tour_listings")
      .insert(publishPayload)
      .select("id")
      .single();

      if (insertListingError || !createdListing) {
        return NextResponse.json(
          { ok: false, error: "We could not publish that listing. Please try again." },
          { status: 400 },
        );
      }

      listingId = createdListing.id;
    }

    if (!draftTableUnavailable) {
      const { error: draftUpdateError } = await admin
        .from("operator_listing_drafts")
        .update({
          is_published: true,
          published_listing_id: listingId,
        })
        .eq("id", draftRecord.id)
        .eq("operator_id", profileContext.profile.id);

      if (draftUpdateError) {
        if (isMissingTableOrSchemaError(draftUpdateError)) {
          draftTableUnavailable = true;
        } else {
          return NextResponse.json(
            { ok: false, error: "We could not update the draft listing. Please try again." },
            { status: 400 },
          );
        }
      }
    }

    revalidatePath("/CreateListing");
    revalidatePath("/OperatorDashboard");
    revalidatePath("/OperatorBookings");
    revalidatePath("/OperatorListings");
    if (listingId) {
      revalidatePath(`/OperatorListings/${listingId}/edit`);
    }
    revalidatePath("/Inquiry");
    revalidatePath("/AdminDashboard");
    revalidatePath("/AdminListings");
    revalidatePath("/AdminAnalytics");

    await recordAdminNotifications({
      actorProfileId: profileContext.profile.id,
      kind: "listing_submitted_for_review",
      title: "Listing submitted for review",
      body: `${profileContext.profile.full_name} submitted ${draftRecord.title ?? "a listing"} for review.`,
      href: listingId ? `/AdminListings?listing=${listingId}` : "/AdminListings",
      entityType: "listing",
      entityId: listingId ?? draftRecord.id,
      metadata: {
        listingId,
        draftId: draftRecord.id,
        operatorId: profileContext.profile.id,
        mode,
      },
    }).catch((notificationError) => {
      console.error("Unable to record admin listing notification", {
        listingId,
        draftId: draftRecord.id,
        error: notificationError,
      });
    });

    await recordPlatformNotification({
      recipientProfileId: profileContext.profile.id,
      actorProfileId: profileContext.profile.id,
      kind: "listing_submitted_for_review",
      title: "Listing submitted for review",
      body: `${draftRecord.title ?? "Your listing"} is now waiting for admin review.`,
      href: listingId ? `/OperatorListings/${listingId}/edit` : "/OperatorBookings",
      entityType: "listing",
      entityId: listingId ?? draftRecord.id,
      metadata: {
        listingId,
        draftId: draftRecord.id,
        operatorId: profileContext.profile.id,
        mode,
      },
    }).catch((notificationError) => {
      console.error("Unable to record operator listing notification", {
        listingId,
        draftId: draftRecord.id,
        error: notificationError,
      });
    });

    return NextResponse.json({
      ok: true,
      draft: draftRecord,
      listing: { id: listingId },
      completion: 100,
      local_only: draftTableUnavailable,
    });
  }

  revalidatePath("/CreateListing");
  revalidatePath("/OperatorDashboard");
  revalidatePath("/OperatorBookings");
  revalidatePath("/OperatorListings");
  const editListingId = draftRecord.published_listing_id;
  if (editListingId) {
    revalidatePath(`/OperatorListings/${editListingId}/edit`);
  }

  return NextResponse.json({
    ok: true,
    draft: draftRecord,
    completion: completion.percentage,
    local_only: draftTableUnavailable,
  });
}
