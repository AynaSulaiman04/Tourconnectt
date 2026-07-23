import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { getOperatorWorkspaceData } from "@/lib/supabase/operator";
import type { OperatorListingDraftRecord } from "@/lib/supabase/operator-listings";
import type { TourListing, TravelerInquiry } from "@/lib/supabase/inquiry-types";
import { isPendingWiPayPayment, isSuccessfulWiPayPayment } from "@/lib/payments/wipay";

type OperatorBookingsPageProps = {
  searchParams: Promise<{
    view?: string;
    q?: string;
    page?: string;
    listing?: string;
  }>;
};

type BookingStatus = "live" | "draft" | "review";

type BookingCard = Omit<TourListing, "status"> & {
  statusType: BookingStatus;
  status: string;
  sourceType: "listing" | "draft";
  editHref: string;
  stats?: {
    requests: string;
    confirmed: string;
    pending: string;
  };
  note?: string;
  reviewText?: string;
  inquiryCount: number;
  pendingCount: number;
  confirmedCount: number;
  selected: boolean;
  paymentText?: string | null;
};

type BookingInquiry = TravelerInquiry & {
  payment?: {
    status: string;
    created_at: string;
  } | null;
};

function normalizeView(value?: string) {
  switch (value) {
    case "live":
    case "drafts":
    case "review":
      return value;
    default:
      return "all";
  }
}

function buildHref({
  view,
  q,
  page,
  listing,
}: {
  view?: string;
  q?: string;
  page?: number;
  listing?: string;
}) {
  const params = new URLSearchParams();

  if (view && view !== "all") {
    params.set("view", view);
  }

  if (q) {
    params.set("q", q);
  }

  if (page && page > 1) {
    params.set("page", String(page));
  }

  if (listing) {
    params.set("listing", listing);
  }

  const query = params.toString();

  return query ? `/OperatorBookings?${query}` : "/OperatorBookings";
}

function getListingCards(
  listings: TourListing[],
  drafts: OperatorListingDraftRecord[],
  inquiries: BookingInquiry[],
  operatorName: string,
  selectedListingId: string,
) {
  const inquiriesByListingId = new Map<string, BookingInquiry[]>();
  const draftLookup = new Map(
    drafts.filter((draft) => draft.published_listing_id).map((draft) => [draft.published_listing_id as string, draft.id]),
  );

  inquiries.forEach((inquiry) => {
    if (!inquiry.listing_id) {
      return;
    }

    const current = inquiriesByListingId.get(inquiry.listing_id) ?? [];
    current.push(inquiry);
    inquiriesByListingId.set(inquiry.listing_id, current);
  });

  const liveCards = listings.map<BookingCard>((listing) => {
    const relatedInquiries = inquiriesByListingId.get(listing.id) ?? [];
    const pendingCount = relatedInquiries.filter((item) => ["submitted", "reviewed"].includes(item.status)).length;
    const confirmedCount = relatedInquiries.filter((item) => item.status === "confirmed").length;
    const totalInquiries = relatedInquiries.length;
    const selected = selectedListingId === listing.id;
    const hasLinkedDraft = draftLookup.has(listing.id);
    const statusType: BookingStatus = listing.is_active ? (pendingCount > 0 ? "review" : "live") : "review";
    const latestPayment = [...relatedInquiries]
      .map((item) => item.payment)
      .filter((payment): payment is { status: string; created_at: string } => Boolean(payment))
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0] ?? null;

    const paymentText = latestPayment
      ? isSuccessfulWiPayPayment(latestPayment.status)
        ? "Payment: Paid"
        : isPendingWiPayPayment(latestPayment.status)
          ? "Payment: Pending"
          : latestPayment.status === "failed" || latestPayment.status === "error"
            ? "Payment: Failed"
            : latestPayment.status === "refunded"
              ? "Payment: Refunded"
              : null
      : null;

    return {
      ...listing,
      sourceType: "listing",
      statusType,
      status: statusType === "live" ? "Live" : "Under Review",
      editHref: `/OperatorListings/${listing.id}/edit`,
      inquiryCount: totalInquiries,
      pendingCount,
      confirmedCount,
      selected,
      paymentText,
      stats:
        statusType === "live"
          ? {
              requests: totalInquiries.toLocaleString(),
              confirmed: confirmedCount.toLocaleString(),
              pending: pendingCount.toLocaleString(),
            }
          : undefined,
      note:
          statusType === "review"
            ? pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? "reply" : "replies"} pending approval`
              : hasLinkedDraft
                ? "Waiting for admin approval."
                : "Under review."
          : undefined,
      reviewText: statusType === "review" ? `${pendingCount} ${pendingCount === 1 ? "reply" : "replies"} pending` : undefined,
    };
  });

  const draftCards = drafts.map<BookingCard>((draft) => ({
    id: draft.id,
    title: draft.title ?? "Untitled draft",
    location: draft.location ?? "",
    country: draft.country ?? "",
    duration: draft.duration ?? "",
    summary: draft.summary ?? "",
    image_url: draft.image_base64 ?? draft.image_url ?? null,
    price: draft.price ?? null,
    operator_id: draft.operator_id,
    operator_name: operatorName,
    featured: false,
    is_active: false,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    sourceType: "draft",
    statusType: "draft",
    status: "Draft",
    editHref: `/CreateListing?draft=${draft.id}`,
    inquiryCount: 0,
    pendingCount: 0,
    confirmedCount: 0,
    selected: selectedListingId === draft.id,
    note: draft.summary?.trim() || "Waiting for setup completion and first traveler request.",
  }));

  return [...draftCards, ...liveCards];
}

function getFirstLine(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.split("\n")[0]?.trim() ?? "";
}

export default async function TTConnectOperatorListings({
  searchParams,
}: OperatorBookingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const view = normalizeView(resolvedSearchParams.view);
  const searchQuery = resolvedSearchParams.q?.trim() ?? "";
  const currentPage = Math.max(1, Number.parseInt(resolvedSearchParams.page ?? "1", 10) || 1);
  const selectedListingId = resolvedSearchParams.listing?.trim() ?? "";

  const workspace = await getOperatorWorkspaceData();
  const listingCards = getListingCards(
    workspace.listings,
    workspace.drafts,
    workspace.inquiries,
    workspace.profile.full_name.trim(),
    selectedListingId,
  );

  const filteredCards = listingCards.filter((card) => {
    const matchesView =
      view === "all" ||
      (view === "live" && card.statusType === "live") ||
      (view === "drafts" && card.statusType === "draft") ||
      (view === "review" && card.statusType === "review");

    if (!matchesView) {
      return false;
    }

    if (!searchQuery) {
      return true;
    }

    const haystack = [
      card.title,
      card.location,
      card.country,
      card.operator_name,
      card.summary,
      getFirstLine(card.note),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchQuery.toLowerCase());
  });

  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const visibleCards = filteredCards.slice((page - 1) * pageSize, page * pageSize);
  const draftCount = listingCards.filter((card) => card.statusType === "draft").length;
  const reviewCount = listingCards.filter((card) => card.statusType === "review").length;

  const tabLinks = {
    all: buildHref({ q: searchQuery, page: 1, listing: selectedListingId }),
    live: buildHref({ view: "live", q: searchQuery, page: 1, listing: selectedListingId }),
    drafts: buildHref({ view: "drafts", q: searchQuery, page: 1, listing: selectedListingId }),
    review: buildHref({ view: "review", q: searchQuery, page: 1, listing: selectedListingId }),
  };

  const prevHref =
    page > 1
      ? buildHref({
          view,
          q: searchQuery,
          page: page - 1,
          listing: selectedListingId,
        })
      : null;
  const nextHref =
    page < totalPages
      ? buildHref({
          view,
          q: searchQuery,
          page: page + 1,
          listing: selectedListingId,
        })
      : null;

  return (
    <PageShell
      travelerProfile={{
        id: workspace.profile.id,
        full_name: workspace.profile.full_name,
        profile_image_url: workspace.profile.profile_image_url,
        role: workspace.profile.role,
      }}
      variant="operator"
    >
      <style>{`
        .tt-operator-page {
          --on-primary-fixed: #231a08;
          --primary-fixed-dim: #d5c5a7;
          --on-background: #1c1b1b;
          --outline-variant: #cec5b9;
          --on-error-container: #93000a;
          --error: #ba1a1a;
          --surface-tint: #695d45;
          --surface-bright: #fcf9f8;
          --primary: #695d45;
          --on-surface: #1c1b1b;
          --secondary-container: #ff875c;
          --on-primary-container: #655941;
          --inverse-primary: #d5c5a7;
          --secondary: #a0401b;
          --tertiary-fixed-dim: #debb7a;
          --tertiary-container: #f3e2c2;
          --tertiary: #b47a16;
          --surface-container-high: #ebe7e7;
          --on-tertiary-fixed-variant: #1b4a6d;
          --on-secondary-container: #722200;
          --on-surface-variant: #4b463d;
          --on-tertiary-container: #325e82;
          --on-primary: #ffffff;
          --on-secondary: #ffffff;
          --on-tertiary-fixed: #001d32;
          --surface-dim: #dcd9d9;
          --primary-fixed: #f2e0c2;
          --on-error: #ffffff;
          --background: #fcf9f8;
          --secondary-fixed-dim: #ffb59c;
          --surface-variant: #e5e2e1;
          --surface-container-low: #f6f3f2;
          --on-tertiary: #ffffff;
          --tertiary-fixed: #f8edd6;
          --surface-container-lowest: #ffffff;
          --outline: #7d766c;
          --primary-container: #e2d1b3;
          --on-secondary-fixed: #380c00;
          --on-secondary-fixed-variant: #802a04;
          --surface-container-highest: #e5e2e1;
          --error-container: #ffdad6;
          --surface: #fcf9f8;
          --inverse-surface: #313030;
          --on-primary-fixed-variant: #51452f;
          --inverse-on-surface: #f3f0ef;
          --surface-container: #f0edec;
          --secondary-fixed: #ffdbcf;
          background-color: var(--background);
          color: var(--on-surface);
          font-family: 'Be Vietnam Pro', sans-serif;
          scroll-behavior: smooth;
          overflow-x: hidden;
        }

        .tt-operator-page .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
        }

        .tt-operator-page .font-display {
          font-family: 'Raleway', sans-serif;
        }

        .tt-operator-page .label-caps {
          font-family: 'Be Vietnam Pro', sans-serif;
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .tt-operator-page a {
          text-decoration: none;
        }

        .ken-burns:hover img {
          transform: scale(1.05);
          transition: transform 6s ease-in-out;
        }

        .operator-search-form {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.9rem 1rem;
          border: 1px solid rgba(17, 19, 24, 0.12);
          border-radius: 1.5rem;
          background: rgba(255, 253, 248, 0.92);
          box-shadow: 0 16px 42px rgba(53, 39, 33, 0.08);
        }

        .operator-search-form .material-symbols-outlined {
          color: var(--secondary);
        }

        .operator-search-form input {
          min-height: 2.95rem;
          padding: 0.82rem 1rem;
          background: rgba(255, 253, 248, 0.94);
          border: 1px solid rgba(17, 19, 24, 0.12);
          border-radius: 1rem;
          outline: none;
          color: var(--on-background);
          font-size: 14px;
          width: 16rem;
        }

        .operator-search-form input:focus {
          border-color: rgba(197, 22, 29, 0.35);
          box-shadow: 0 0 0 3px rgba(197, 22, 29, 0.12);
        }

        .operator-card-active {
          outline: 1px solid rgba(160, 64, 27, 0.18);
          box-shadow: 0 0 0 1px rgba(160, 64, 27, 0.08);
        }
      `}</style>

      <div className="min-h-screen selection:bg-(--primary-container) selection:text-(--on-primary-container)">
        <main className="min-h-screen">
          <header className="h-32 px-20 flex items-center justify-between border-b border-(--outline-variant)/10">
            <div>
              <h2 className="font-display text-[48px] leading-14 tracking-[-0.02em] font-light text-(--primary)">
                Sanctuaries
              </h2>
              <p className="text-[16px] leading-6 text-(--on-surface-variant)/70 italic">
                Managed listings directory
              </p>
            </div>
          </header>

          <section className="px-20 py-8 flex justify-between items-center">
            <div className="flex gap-8 items-center">
              <Link
                className={`label-caps tc-filter-pill ${view === "all" ? "tc-filter-pill-active" : ""}`}
                href={tabLinks.all}
              >
                All Listings ({listingCards.length})
              </Link>
              <Link
                className={`label-caps tc-filter-pill ${view === "drafts" ? "tc-filter-pill-active" : ""}`}
                href={tabLinks.drafts}
              >
                Drafts ({draftCount})
              </Link>
              <Link
                className={`label-caps tc-filter-pill ${view === "review" ? "tc-filter-pill-active" : ""}`}
                href={tabLinks.review}
              >
                Under Review ({reviewCount})
              </Link>
            </div>

            <form className="operator-search-form tc-filter-panel" method="get">
              <span className="material-symbols-outlined">search</span>
              <input name="q" placeholder="Search by name or location..." defaultValue={searchQuery} type="text" />
              <input name="view" type="hidden" value={view} />
              <input name="listing" type="hidden" value={selectedListingId} />
              <input name="page" type="hidden" value="1" />
            </form>
          </section>

          <section className="px-20 pb-40">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {visibleCards.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>

            {!visibleCards.length && (
              <div className="glass-panel mt-8 p-8">
                <p className="text-[16px] leading-6 text-(--on-surface-variant)">
                  No listings matched the current filters. Try a different search or switch tabs.
                </p>
              </div>
            )}
          </section>

          <section className="px-20 pb-24 flex items-center justify-between gap-4">
            <p className="text-[12px] leading-4 uppercase tracking-[0.15em] text-(--on-surface-variant)/60">
              Showing {visibleCards.length} of {filteredCards.length} listings
            </p>

            <div className="flex items-center gap-6">
              {prevHref ? (
                <Link
                  className="btn-icon"
                  href={prevHref}
                  aria-label="Previous page"
                >
                  <span className="material-symbols-outlined align-middle">chevron_left</span>
                </Link>
              ) : (
                <button className="btn-icon" disabled type="button" aria-label="Previous page">
                  <span className="material-symbols-outlined align-middle">chevron_left</span>
                </button>
              )}

              <span className="text-[12px] leading-4 uppercase tracking-[0.15em] text-(--on-surface-variant)">
                Page {String(page).padStart(2, "0")}
              </span>

              {nextHref ? (
                <Link
                  className="btn-icon"
                  href={nextHref}
                  aria-label="Next page"
                >
                  <span className="material-symbols-outlined align-middle">chevron_right</span>
                </Link>
              ) : (
                <button className="btn-icon" disabled type="button" aria-label="Next page">
                  <span className="material-symbols-outlined align-middle">chevron_right</span>
                </button>
              )}
            </div>
          </section>
        </main>
      </div>
    </PageShell>
  );
}

function ListingCard({ listing }: { listing: BookingCard }) {
  const isLive = listing.statusType === "live";
  const isDraft = listing.statusType === "draft";
  const isReview = listing.statusType === "review";

  return (
    <div
      className={`group relative overflow-hidden glass-panel ${isLive ? "ken-burns" : ""} ${
        isDraft ? "opacity-90 grayscale-[0.3] hover:grayscale-0 transition-all" : ""
      } ${listing.selected ? "operator-card-active" : ""}`}
    >
      <div className="flex flex-col md:flex-row h-full">
        <div className="relative w-full md:w-5/12 h-64 md:h-auto overflow-hidden">
          {listing.image_url ? (
            <Image
              fill
              className="object-cover transition-transform duration-6000"
              alt={listing.title}
              quality={100}
              sizes="(max-width: 768px) 100vw, 42vw"
              unoptimized={listing.image_url.startsWith("data:")}
              src={listing.image_url}
            />
          ) : (
            <div className="absolute inset-0 bg-(--surface-container) flex items-center justify-center">
              <span className="material-symbols-outlined text-(--outline) text-[40px]">photo</span>
            </div>
          )}
        </div>

        <div className="w-full md:w-7/12 p-8 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <span
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full ${
                  isLive
                    ? "bg-(--primary)/10 text-(--primary)"
                    : isDraft
                      ? "bg-(--on-surface-variant)/10 text-(--on-surface-variant)"
                      : "bg-(--secondary)/10 text-(--secondary)"
                }`}
              >
                {listing.status}
              </span>
              <Link
                aria-label={isDraft ? `Continue setup for ${listing.title}` : `Edit ${listing.title}`}
                className="btn-icon"
                href={listing.editHref}
              >
                edit
              </Link>
            </div>

            <h3 className="text-[32px] leading-10 tracking-[-0.01em] font-light mb-1">
              {listing.title}
            </h3>
            <p className="text-[12px] leading-4 text-(--on-surface-variant) uppercase tracking-widest mb-6">
              {listing.location}
            </p>

            {isLive && listing.stats && (
              <div className="grid grid-cols-3 gap-4 border-t border-(--outline-variant)/20 pt-6">
                <Stat label="Requests" value={listing.stats.requests} />
                <Stat label="Confirmed" value={listing.stats.confirmed} />
                <Stat label="Pending" value={listing.stats.pending} />
              </div>
            )}

            {isDraft && (
              <p className="text-[16px] leading-6 text-(--on-surface-variant)/60 italic mb-4">
                {listing.note}
              </p>
            )}

            {isReview && (
              <div className="flex items-center gap-2 text-(--secondary) text-xs uppercase font-bold tracking-widest">
                <span className="material-symbols-outlined text-sm!">schedule</span>
                {listing.reviewText}
              </div>
            )}

            {listing.paymentText ? (
              <p className="mt-4 text-[12px] leading-4 uppercase tracking-widest text-(--secondary)">
                {listing.paymentText}
              </p>
            ) : null}

            <p className="mt-4 text-[12px] leading-4 uppercase tracking-widest text-(--on-surface-variant)/50">
              {listing.inquiryCount} {listing.inquiryCount === 1 ? "inquiry" : "inquiries"} linked
            </p>
          </div>

          <div className="mt-8 flex gap-4">
            {isDraft ? (
              <Link
                className="btn-primary btn-sm w-full"
                href={listing.editHref}
              >
                Continue Setup
              </Link>
            ) : isReview ? (
              <Link
                className="btn-outline btn-sm flex-1"
                href={listing.editHref}
              >
                Edit Listing
              </Link>
            ) : (
              <>
                <Link
                  className="btn-outline btn-sm flex-1"
                  href={listing.editHref}
                >
                  Edit Listing
                </Link>
                <Link
                  className="btn-icon"
                  href={`/OperatorMessages?listing=${listing.id}`}
                  aria-label={`Open messages for ${listing.title}`}
                >
                  <span className="material-symbols-outlined">visibility</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase text-(--on-surface-variant)/60 font-semibold">
        {label}
      </span>
      <span className="text-[16px] leading-6">{value}</span>
    </div>
  );
}

