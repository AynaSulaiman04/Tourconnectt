import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { ListingEditor } from "@/app/CreateListing/listing-editor";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import {
  getOperatorListingById,
  getOperatorListingDraftByPublishedListingId,
  type OperatorListingDraftRecord,
} from "@/lib/supabase/operator-listings";

type OperatorListingEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function buildSyntheticDraft(
  listing: Awaited<ReturnType<typeof getOperatorListingById>>,
  profile: NonNullable<Awaited<ReturnType<typeof getOptionalCurrentUserProfile>>>["profile"],
): OperatorListingDraftRecord {
  if (!listing) {
    throw new Error("Listing is required.");
  }

  const now = new Date().toISOString();

  return {
    id: listing.id,
    operator_id: profile.id,
    title: listing.title ?? "",
    location: listing.location ?? "",
    country: listing.country ?? "",
    duration: listing.duration ?? "",
    summary: listing.summary ?? "",
    category: "",
    price: listing.price ?? "",
    availability: "",
    capacity: null,
    itinerary: "",
    inclusions: "",
    exclusions: "",
    contact_name: profile.full_name,
    contact_email: profile.email,
    contact_phone: null,
    image_url: listing.image_url,
    image_base64: listing.image_url?.startsWith("data:") ? listing.image_url : null,
    is_published: true,
    published_listing_id: listing.id,
    created_at: listing.created_at ?? now,
    updated_at: listing.updated_at ?? now,
  };
}

export default async function OperatorListingEditPage({ params }: OperatorListingEditPageProps) {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile) {
    redirect("/LoginPage");
  }

  if (profileContext.profile.role !== "operator") {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  const resolvedParams = await params;
  const listing = await getOperatorListingById(profileContext.profile.id, resolvedParams.id);

  if (!listing) {
    return (
      <PageShell
        variant="operator"
        travelerProfile={{
          id: profileContext.profile.id,
          full_name: profileContext.profile.full_name,
          profile_image_url: profileContext.profile.profile_image_url,
          role: profileContext.profile.role,
        }}
      >
        <main className="px-margin-mobile md:px-margin-desktop py-10 pb-section-gap">
          <div className="section-shell">
            <div className="glass-panel p-gutter">
              <p className="label-caps text-secondary mb-2">Listing editor</p>
              <h1 className="font-display text-[32px] leading-9 font-light text-on-background">
                Listing not found.
              </h1>
              <p className="mt-3 text-sm text-on-surface-variant">
                We could not find this listing for your operator account.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="btn-primary btn-sm" href="/OperatorBookings">
                  Back to Bookings
                </Link>
                <Link className="btn-outline btn-sm" href="/OperatorListings">
                  Back to Listings
                </Link>
              </div>
            </div>
          </div>
        </main>
      </PageShell>
    );
  }

  const linkedDraft =
    (await getOperatorListingDraftByPublishedListingId(profileContext.profile.id, listing.id)) ??
    buildSyntheticDraft(listing, profileContext.profile);

  return (
    <PageShell
      variant="operator"
      travelerProfile={{
        id: profileContext.profile.id,
        full_name: profileContext.profile.full_name,
        profile_image_url: profileContext.profile.profile_image_url,
        role: profileContext.profile.role,
      }}
    >
      <ListingEditor initialDraft={linkedDraft} operatorName={profileContext.profile.full_name} />
    </PageShell>
  );
}
