import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { getOperatorListingDrafts, getOperatorListings } from "@/lib/supabase/operator-listings";
import { formatListingPrice } from "@/lib/format/listing-price";

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays < 1) {
    return "Updated today";
  }

  if (diffDays === 1) {
    return "Updated yesterday";
  }

  return `Updated ${diffDays}d ago`;
}

export default async function OperatorListingsPage() {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile) {
    redirect("/LoginPage");
  }

  if (profileContext.profile.role !== "operator") {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  const [listings, drafts] = await Promise.all([
    getOperatorListings(profileContext.profile.id),
    getOperatorListingDrafts(profileContext.profile.id),
  ]);
  const activeListings = listings.filter((listing) => listing.is_active);
  const draftByListingId = new Map(
    drafts.filter((draft) => draft.published_listing_id).map((draft) => [draft.published_listing_id as string, draft.id]),
  );

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
      <main className="portal-list-page">
        <div className="section-shell">
          <div className="flex flex-col gap-3">
            <p className="label-caps text-secondary">Operator listings</p>
            <h1 className="font-display text-[48px] leading-14 tracking-[-0.02em] font-light text-on-background">
              Manage your live listings.
            </h1>
            <p className="max-w-[720px] text-[18px] leading-7 font-light text-on-surface-variant">
              Review the listings connected to your operator account, open a listing to view its
              details, or publish a new experience from the editor.
            </p>
          </div>
        </div>

        <section className="section-shell grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <div className="lg:col-span-8 space-y-gutter">
            {listings.length ? (
              listings.map((listing) => (
                <GlassPanel key={listing.id} className="overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="relative min-h-[220px] bg-surface-container-high">
                      {listing.image_url ? (
                        <Image
                          fill
                          alt={listing.title}
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 220px"
                          unoptimized={listing.image_url.startsWith("data:")}
                          src={listing.image_url}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant">
                          <span className="material-symbols-outlined text-[44px]">photo</span>
                        </div>
                      )}
                    </div>

                    <div className="p-gutter flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="label-caps text-secondary">Listing</span>
                        <span className="rounded-full border border-outline-variant/20 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant">
                          {listing.is_active ? "Live" : draftByListingId.has(listing.id) ? "Under Review" : "Draft"}
                        </span>
                        {listing.featured ? (
                          <span className="rounded-full border border-outline-variant/20 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-secondary">
                            Featured
                          </span>
                        ) : null}
                      </div>
                      <div>
                        <h2 className="font-display text-[32px] leading-9 font-light text-on-background">
                          {listing.title}
                        </h2>
                        <p className="mt-2 text-sm text-on-surface-variant">
                          {listing.summary || "No summary has been added yet."}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3">
                          <div className="label-caps text-secondary mb-1">Location</div>
                          <div className="text-sm text-on-background">
                            {listing.location || listing.country || "Location on request"}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3">
                          <div className="label-caps text-secondary mb-1">Duration</div>
                          <div className="text-sm text-on-background">{listing.duration || "Enquiry based"}</div>
                        </div>
                        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3">
                          <div className="label-caps text-secondary mb-1">Price</div>
                          <div className="text-sm text-on-background">{formatListingPrice(listing.price) || "Price on request"}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <p className="text-xs uppercase tracking-[0.15em] text-on-surface-variant/70">
                          {formatRelativeTime(listing.updated_at)}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {listing.is_active ? (
                            <Link className="btn-ghost btn-sm" href={`/OperatorListings/${listing.id}`}>
                              Open listing
                            </Link>
                          ) : (
                            <Link className="btn-ghost btn-sm" href={`/OperatorListings/${listing.id}/edit`}>
                              Edit listing
                            </Link>
                          )}
                          <Link className="btn-outline btn-sm" href="/CreateListing">
                            New listing
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </GlassPanel>
              ))
            ) : (
              <GlassPanel className="p-gutter">
                <p className="label-caps text-secondary mb-2">Listings</p>
                <h2 className="font-display text-[32px] leading-9 font-light text-on-background">
                  No listings have been created yet.
                </h2>
                <p className="mt-3 text-sm text-on-surface-variant">
                  Create your first listing to publish it to travelers and connect it to inquiries.
                </p>
                <div className="mt-6">
                  <Link className="btn-primary btn-sm" href="/CreateListing">
                    Create Listing
                  </Link>
                </div>
              </GlassPanel>
            )}
          </div>

          <div className="lg:col-span-4 space-y-gutter">
            <GlassPanel className="p-gutter">
              <p className="eyebrow mb-2">Overview</p>
              <h2 className="font-display text-[30px] leading-9 font-light text-on-background">
                Listing status at a glance.
              </h2>
              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                  <div className="label-caps text-secondary mb-1">Total listings</div>
                  <div className="font-display text-[40px] leading-none font-light text-on-background">
                    {listings.length}
                  </div>
                </div>
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                  <div className="label-caps text-secondary mb-1">Active listings</div>
                  <div className="font-display text-[40px] leading-none font-light text-on-background">
                    {activeListings.length}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="btn-primary btn-sm" href="/CreateListing">
                  Create Listing
                </Link>
                <Link className="btn-outline btn-sm" href="/OperatorDashboard">
                  Back to Dashboard
                </Link>
              </div>
            </GlassPanel>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
