"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAdminProfile } from "@/lib/supabase/admin";
import { recordPlatformEvent } from "@/lib/supabase/analytics";
import { recordAdminNotifications, recordPlatformNotification } from "@/lib/supabase/notifications";

function getReturnTo(formData: FormData) {
  const value = String(formData.get("return_to") ?? "").trim();
  return value || "/AdminListings";
}

function buildRedirectUrl(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, "http://tt-connect.local");

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return `${url.pathname}${url.search}`;
}

export async function updateListingModerationAction(formData: FormData) {
  const profile = await requireAdminProfile();

  const listingId = String(formData.get("listing_id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  const returnTo = getReturnTo(formData);

  if (!listingId) {
    redirect(buildRedirectUrl(returnTo, { error: "missing-listing" }));
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: currentListing } = await admin
    .from("tour_listings")
    .select("operator_id,operator_name,title")
    .eq("id", listingId)
    .maybeSingle();
  const resolvedOperatorId = currentListing?.operator_id ?? null;

  const patch: { is_active?: boolean; featured?: boolean; status?: "under_review" | "live" | "rejected" } = {};

  if (action === "approve") {
    patch.is_active = true;
    patch.status = "live";
  } else if (action === "reject") {
    patch.is_active = false;
    patch.featured = false;
    patch.status = "rejected";
  } else if (action === "feature") {
    const { data: current } = await admin
      .from("tour_listings")
      .select("featured,status,is_active")
      .eq("id", listingId)
      .maybeSingle();

    if (!current || current.status !== "live" || !current.is_active) {
      redirect(buildRedirectUrl(returnTo, { error: "Only live listings can be featured." }));
    }

    patch.featured = !(current?.featured ?? false);
  } else {
    redirect(buildRedirectUrl(returnTo, { error: "Choose a valid moderation action." }));
  }

  const { error } = await admin.from("tour_listings").update(patch).eq("id", listingId);

  if (error) {
    console.error("Unable to update listing moderation", { listingId, action, error: error.message });
    redirect(buildRedirectUrl(returnTo, { error: "We could not update this listing. Please try again." }));
  }

  const eventType =
    action === "approve" ? "listing_approved" : action === "reject" ? "listing_rejected" : "listing_featured";
  const listingTitle = currentListing?.title ?? "Your listing";

  await recordPlatformEvent({
    event_type: eventType,
    actor_profile_id: profile.id,
    actor_role: "admin",
    listing_id: listingId,
    metadata: { action },
  });

  await recordAdminNotifications({
    actorProfileId: profile.id,
    excludeProfileId: profile.id,
    kind: eventType,
    title:
      action === "approve"
        ? "Listing approved"
        : action === "reject"
          ? "Listing rejected"
          : "Listing featured",
      body:
        action === "approve"
          ? "A listing has been approved and is ready for travelers."
          : action === "reject"
          ? "A listing has been rejected and removed from the approval queue."
          : "A listing feature setting was updated.",
    href: `/AdminListings?listing=${listingId}`,
    entityType: "listing",
    entityId: listingId,
    metadata: { action },
  }).catch((notificationError) => {
    console.error("Unable to record admin listing moderation notification", {
      listingId,
      action,
      error: notificationError,
    });
  });

  if (resolvedOperatorId) {
    await recordPlatformNotification({
      recipientProfileId: resolvedOperatorId,
      actorProfileId: profile.id,
      kind: eventType,
      title:
        action === "approve"
          ? "Listing approved"
          : action === "reject"
            ? "Listing rejected"
            : "Listing featured",
      body:
        action === "approve"
          ? `${listingTitle} is now live for travelers.`
          : action === "reject"
            ? `${listingTitle} was rejected during review.`
            : `${listingTitle} is now featured on the platform.`,
      href: `/OperatorListings/${listingId}/edit`,
      entityType: "listing",
      entityId: listingId,
      metadata: {
        action,
        operatorName: currentListing?.operator_name ?? null,
      },
    }).catch((notificationError) => {
      console.error("Unable to record operator listing moderation notification", {
        listingId,
        action,
        error: notificationError,
      });
    });
  }

  revalidatePath("/AdminDashboard");
  revalidatePath("/AdminListings");
  revalidatePath("/OperatorDashboard");
  revalidatePath("/OperatorBookings");
  revalidatePath("/OperatorListings");
  revalidatePath("/AdminAnalytics");
  revalidatePath("/AdminPromotions");
  redirect(buildRedirectUrl(returnTo, { updated: "1" }));
}
