import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { PageShell } from "@/components/layout/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TableWrapper } from "@/components/ui/TableWrapper";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";
import { updateListingModerationAction } from "./actions";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getFriendlyFeedbackMessage } from "@/lib/ui/feedback";

type AdminListingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ListingView = "all" | "under_review" | "live" | "rejected" | "featured" | "drafts";
type ListingSort = "newest" | "oldest" | "status" | "operator";

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function normalizeView(value: string | undefined): ListingView {
  return value === "under_review" || value === "live" || value === "rejected" || value === "featured" || value === "drafts"
    ? value
    : "all";
}

function normalizeSort(value: string | undefined): ListingSort {
  return value === "oldest" || value === "status" || value === "operator" ? value : "newest";
}

function getListingStatus(listing: { status?: string | null; featured: boolean; is_active: boolean }) {
  if (listing.status === "rejected") {
    return "rejected" as const;
  }

  if (listing.status === "draft") {
    return "draft" as const;
  }

  if (listing.status === "under_review") {
    return "under_review" as const;
  }

  if (listing.status === "live") {
    return "live" as const;
  }

  if (listing.featured || listing.is_active) {
    return "live" as const;
  }

  return "under_review" as const;
}

function getListingStatusLabel(status: ReturnType<typeof getListingStatus>) {
  return status === "live"
    ? "Live"
    : status === "rejected"
      ? "Rejected"
      : status === "draft"
        ? "Draft"
        : "Under Review";
}

function buildListingsHref(base: string, params: Record<string, string>) {
  const url = new URL(base, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}`;
}

export default async function AdminListingsPage({ searchParams }: AdminListingsPageProps) {
  const workspace = await getAdminWorkspaceData();
  const resolvedSearchParams = await searchParams;
  const selectedId = getParam(resolvedSearchParams.listing);
  const query = getParam(resolvedSearchParams.q).trim();
  const view = normalizeView(getParam(resolvedSearchParams.view));
  const sort = normalizeSort(getParam(resolvedSearchParams.sort));
  const actionMessage = resolvedSearchParams.updated ? "Listing updated." : null;
  const actionError = getFriendlyFeedbackMessage(
    getParam(resolvedSearchParams.error),
    "We could not update this listing. Please try again.",
  );

  const filteredListings = workspace.listings
    .filter((item) => {
      const status = getListingStatus(item);
      const searchTerm = query.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        [item.title, item.operator_name, item.location, item.country, item.summary ?? ""].some((field) =>
          field.toLowerCase().includes(searchTerm),
        );
      const matchesView =
        view === "all" ||
        (view === "featured" && item.featured) ||
        (view === "drafts" && status === "draft") ||
        (view === "under_review" && status === "under_review") ||
        (view === "live" && status === "live") ||
        (view === "rejected" && status === "rejected");

      return matchesSearch && matchesView;
    })
    .sort((left, right) => {
      if (sort === "operator") {
        return left.operator_name.localeCompare(right.operator_name);
      }

      if (sort === "status") {
        return getListingStatus(left).localeCompare(getListingStatus(right));
      }

      const leftTime = new Date(left.created_at).getTime();
      const rightTime = new Date(right.created_at).getTime();
      return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });

  const selectedListing = filteredListings.find((listing) => listing.id === selectedId) ?? filteredListings[0] ?? workspace.listings[0] ?? null;

  const totalListings = workspace.listings.length;
  const underReviewListings = workspace.listings.filter((listing) => getListingStatus(listing) === "under_review").length;
  const liveListings = workspace.listings.filter((listing) => getListingStatus(listing) === "live").length;
  const rejectedListings = workspace.listings.filter((listing) => getListingStatus(listing) === "rejected").length;
  const featuredListings = workspace.listings.filter((listing) => listing.featured).length;

  return (
    <PageShell variant="admin">
      <main className="px-margin-mobile md:px-margin-desktop py-10 pb-section-gap">
        <SectionHeader
          level={1}
          eyebrow="Admin listings"
          title="Moderate every listing before it reaches travelers."
          description="Review operator submissions, approve high-quality tours, and keep the platform's featured inventory aligned with the Tour ConnecTT standard."
          action={
            <Button href="/AdminAnalytics" variant="outline">
              Analytics Hub
            </Button>
          }
        />
        {actionMessage ? (
          <div className="mt-6">
            <StatusMessage tone="success">{actionMessage}</StatusMessage>
          </div>
        ) : null}
        {resolvedSearchParams.error ? (
          <div className="mt-4">
            <StatusMessage tone="error">{actionError}</StatusMessage>
          </div>
        ) : null}

        <section className="section-shell grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-gutter">
          {[
            ["All", totalListings.toLocaleString(), "Every operator listing in Supabase."],
            ["Under Review", underReviewListings.toLocaleString(), "Awaiting editorial review."],
            ["Live", liveListings.toLocaleString(), "Approved and visible on the platform."],
            ["Rejected", rejectedListings.toLocaleString(), "Removed from the approval queue."],
            ["Featured", featuredListings.toLocaleString(), "Highlighted across public surfaces."],
          ].map(([label, value, note]) => (
            <GlassPanel key={label} className="p-gutter h-full">
              <div className="label-caps text-secondary mb-3">{label}</div>
              <div className="text-display-xl-mobile text-on-background">{value}</div>
              <p className="section-copy mt-2">{note}</p>
            </GlassPanel>
          ))}
        </section>

        <section className="section-shell">
          <GlassPanel className="p-gutter tc-filter-panel">
            <form className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_repeat(2,minmax(0,0.85fr))_auto] lg:items-end" method="get">
              <div className="grid gap-2">
                <label className="tc-filter-label">Search</label>
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Search title, operator, or location"
                  className="tc-filter-input text-sm"
                />
              </div>
              <div className="grid gap-2">
                <label className="tc-filter-label">View</label>
                <select
                  name="view"
                  defaultValue={view}
                  className="tc-filter-select text-sm"
                >
                  <option value="all">All</option>
                  <option value="under_review">Under Review</option>
                  <option value="live">Approved / Live</option>
                  <option value="rejected">Rejected</option>
                  <option value="featured">Featured</option>
                  <option value="drafts">Drafts</option>
                </select>
              </div>
              <div className="grid gap-2">
                <label className="tc-filter-label">Sort</label>
                <select
                  name="sort"
                  defaultValue={sort}
                  className="tc-filter-select text-sm"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="status">Status</option>
                  <option value="operator">Operator</option>
                </select>
              </div>
              <Button variant="primary" type="submit" className="btn-sm tc-filter-primary">
                Apply
              </Button>
            </form>

            <div className="mt-5 tc-filter-tabs">
              {[
                ["all", "All"],
                ["under_review", "Under Review"],
                ["live", "Approved / Live"],
                ["rejected", "Rejected"],
                ["featured", "Featured"],
                ["drafts", "Drafts"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  href={buildListingsHref("/AdminListings", {
                    q: query,
                    view: value,
                    sort,
                  })}
                  variant={view === value ? "primary" : "outline"}
                  className={`btn-sm tc-filter-pill shadow-[0_1px_0_rgba(55,45,38,0.04)] ${view === value ? "tc-filter-pill-active" : ""}`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section className="section-shell grid grid-cols-1 lg:grid-cols-12 gap-gutter items-stretch">
          <div className="lg:col-span-8 flex flex-col">
            <SectionHeader
              eyebrow="Approval queue"
              title="Listings waiting for moderation."
              description="Confirm the experience quality, the luxury standard, and whether the operator listing is ready for public discovery."
            />

            <GlassPanel className="mt-6 p-0 overflow-hidden flex-1">
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Operator</th>
                    <th>Status</th>
                    <th>Details</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredListings.length ? (
                    filteredListings.map((item) => {
                      const status = getListingStatus(item);

                      return (
                        <tr key={item.id}>
                          <td className="align-middle">
                            <div className="flex min-w-[200px] items-center gap-3">
                              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-container-high">
                                {item.image_url ? (
                                  <Image
                                    alt={item.title}
                                    fill
                                    className="object-cover"
                                    sizes="40px"
                                    src={item.image_url}
                                  />
                                ) : null}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-on-background line-clamp-2">{item.title}</div>
                                <div className="text-xs uppercase tracking-[0.15em] text-on-surface-variant/70">
                                  {formatDate(item.updated_at)}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="align-middle">
                            <div className="min-w-[120px] text-sm text-on-background">{item.operator_name}</div>
                          </td>

                          <td className="align-middle">
                            <Badge tone={status === "live" ? "accent" : "soft"}>{getListingStatusLabel(status)}</Badge>
                          </td>

                          <td className="align-middle">
                            <div className="text-sm text-on-surface-variant">
                              {item.location} · {item.country}
                            </div>
                            <div className="text-xs uppercase tracking-[0.15em] text-on-surface-variant/70">
                              {item.duration} · {item.price ?? "No price"}
                            </div>
                          </td>

                          <td className="align-middle text-center">
                            <div className="admin-action-group whitespace-nowrap">
                              <Button href={`/AdminListings?listing=${item.id}`} variant="outline" className="btn-sm">
                                Review
                              </Button>
                              <form action={updateListingModerationAction}>
                                <input name="listing_id" type="hidden" value={item.id} />
                                <input name="return_to" type="hidden" value={`/AdminListings?listing=${item.id}`} />
                                <input name="action" type="hidden" value="reject" />
                                <FormSubmitButton variant="danger" className="btn-sm" pendingLabel="Rejecting...">
                                  Reject
                                </FormSubmitButton>
                              </form>
                              <form action={updateListingModerationAction}>
                                <input name="listing_id" type="hidden" value={item.id} />
                                <input name="return_to" type="hidden" value={`/AdminListings?listing=${item.id}`} />
                                <input name="action" type="hidden" value="approve" />
                                <FormSubmitButton variant="primary" className="btn-sm" pendingLabel="Approving...">
                                  Approve
                                </FormSubmitButton>
                              </form>
                              <form action={updateListingModerationAction}>
                                <input name="listing_id" type="hidden" value={item.id} />
                                <input name="return_to" type="hidden" value={`/AdminListings?listing=${item.id}`} />
                                <input name="action" type="hidden" value="feature" />
                                <FormSubmitButton variant="outline" className="btn-sm" pendingLabel="Updating...">
                                  Toggle Featured
                                </FormSubmitButton>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="px-6 py-10 text-center">
                          <p className="font-body-md text-on-background">No listings match your filters.</p>
                          <p className="mt-2 text-sm text-on-surface-variant">
                            Listings will appear here once operators create or submit them.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </TableWrapper>
            </GlassPanel>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-gutter">
            <GlassPanel className="p-gutter flex-1">
              <SectionHeader
                eyebrow="Selected listing"
                title={selectedListing ? selectedListing.title : "No listings yet"}
                description={selectedListing ? selectedListing.summary : "Listings will appear here automatically."}
              />

              {selectedListing ? (
                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Operator</div>
                    <div className="font-body-md text-on-background">{selectedListing.operator_name}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Location</div>
                    <div className="font-body-md text-on-background">
                      {selectedListing.location} · {selectedListing.country}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Status</div>
                    <div className="font-body-md text-on-background">{getListingStatusLabel(getListingStatus(selectedListing))}</div>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
                    <div className="label-caps text-secondary mb-1">Created</div>
                    <div className="font-body-md text-on-background">{formatDate(selectedListing.created_at)}</div>
                  </div>
                </div>
              ) : null}

              {selectedListing ? (
                <div className="mt-6 grid gap-3">
                  <form action={updateListingModerationAction}>
                    <input name="listing_id" type="hidden" value={selectedListing.id} />
                    <input name="return_to" type="hidden" value={`/AdminListings?listing=${selectedListing.id}`} />
                    <input name="action" type="hidden" value="feature" />
                  <FormSubmitButton variant="outline" className="w-full btn-sm" pendingLabel="Updating feature...">
                    Toggle Featured
                  </FormSubmitButton>
                </form>
                  <Link className="btn-outline btn-sm w-full" href="/AdminAnalytics">
                    Open Analytics
                  </Link>
                </div>
              ) : null}
            </GlassPanel>

            <GlassPanel className="p-gutter">
              <div className="label-caps text-secondary mb-2">Moderation note</div>
              <p className="section-copy">
                Keep image quality, copy tone, and pricing clarity aligned with the luxury editorial standard before approving a listing.
              </p>
              <div className="mt-6 admin-action-group">
                <Button href="/AdminDashboard" variant="outline">
                  Dashboard
                </Button>
                <Button href="/AdminAnalytics" variant="ghost">
                  Analytics
                </Button>
              </div>
            </GlassPanel>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
