import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { formatDateRange as formatPreferredDateRange } from "@/lib/format/date";
import {
  getOperatorDashboardData,
  type OperatorDashboardInquirySummary,
} from "@/lib/supabase/operator-dashboard";

type OperatorBookingsPageProps = {
  searchParams: Promise<{
    view?: string;
    q?: string;
    page?: string;
  }>;
};

type BookingView = "all" | "pending" | "confirmed" | "completed";

const PAGE_SIZE = 8;
const PENDING_STATUSES = new Set([
  "submitted",
  "pending",
  "new",
  "under_review",
  "awaiting_response",
  "reviewed",
]);
const CONFIRMED_STATUSES = new Set(["confirmed", "approved", "booked", "payable"]);
const COMPLETED_STATUSES = new Set(["completed", "fulfilled", "closed"]);

function normalizeView(value: string | undefined): BookingView {
  return value === "pending" || value === "confirmed" || value === "completed" ? value : "all";
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isInView(booking: OperatorDashboardInquirySummary, view: BookingView) {
  const status = normalizeStatus(booking.status);

  if (view === "pending") {
    return PENDING_STATUSES.has(status);
  }

  if (view === "confirmed") {
    return CONFIRMED_STATUSES.has(status);
  }

  if (view === "completed") {
    return COMPLETED_STATUSES.has(status);
  }

  return true;
}

function formatLabel(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatBookingDateRange(booking: OperatorDashboardInquirySummary) {
  return formatPreferredDateRange(booking.preferred_start_date, booking.preferred_end_date, {
    fallback: "Date on request",
    separator: " – ",
  });
}

function formatPayment(booking: OperatorDashboardInquirySummary) {
  const payment = booking.payment;
  if (!payment) {
    return {
      label: "Not started",
      detail: "No WiPay attempt",
    };
  }

  const parsedAmount = Number.parseFloat(payment.amount);
  const amount = Number.isFinite(parsedAmount)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: payment.currency || "TTD",
        maximumFractionDigits: 2,
      }).format(parsedAmount)
    : payment.amount;

  return {
    label: formatLabel(payment.status, "Pending"),
    detail: amount,
  };
}

function buildBookingsHref(params: {
  view: BookingView;
  query?: string;
  page?: number;
}) {
  const search = new URLSearchParams();
  if (params.view !== "all") {
    search.set("view", params.view);
  }
  if (params.query) {
    search.set("q", params.query);
  }
  if (params.page && params.page > 1) {
    search.set("page", String(params.page));
  }

  const query = search.toString();
  return query ? `/OperatorBookings?${query}` : "/OperatorBookings";
}

export default async function OperatorBookingsPage({
  searchParams,
}: OperatorBookingsPageProps) {
  const [dashboard, resolvedSearchParams] = await Promise.all([
    getOperatorDashboardData(),
    searchParams,
  ]);
  const view = normalizeView(resolvedSearchParams.view);
  const searchQuery = resolvedSearchParams.q?.trim() ?? "";
  const normalizedQuery = searchQuery.toLowerCase();
  const requestedPage = Math.max(
    1,
    Number.parseInt(resolvedSearchParams.page ?? "1", 10) || 1,
  );

  const matchingBookings = dashboard.bookings.filter((booking) => {
    if (!isInView(booking, view)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [
      booking.traveler_name,
      booking.traveler_email,
      booking.listing_title,
      booking.destination,
      booking.destination_country,
      booking.status,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
  const pageCount = Math.max(1, Math.ceil(matchingBookings.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const visibleBookings = matchingBookings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const counts = {
    all: dashboard.bookings.length,
    pending: dashboard.bookings.filter((booking) => isInView(booking, "pending")).length,
    confirmed: dashboard.bookings.filter((booking) => isInView(booking, "confirmed")).length,
    completed: dashboard.bookings.filter((booking) => isInView(booking, "completed")).length,
  };

  return (
    <PageShell
      variant="operator"
      travelerProfile={{
        id: dashboard.profile.id,
        full_name: dashboard.profile.full_name,
        profile_image_url: dashboard.profile.profile_image_url,
        role: dashboard.profile.role,
      }}
    >
      <main className="portal-list-page">
        <section className="section-shell">
          <p className="label-caps text-secondary">Operator bookings</p>
          <h1 className="mt-3 font-display text-[clamp(2.5rem,8vw,4rem)] leading-none font-light tracking-[-0.03em] text-on-background">
            Traveller bookings
          </h1>
          <p className="mt-4 max-w-3xl text-[18px] leading-7 font-light text-on-surface-variant">
            Review every assigned inquiry, trip date, payment state, and traveler conversation in
            one place.
          </p>
        </section>

        <section className="section-shell grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ["All", counts.all],
              ["Pending", counts.pending],
              ["Confirmed", counts.confirmed],
              ["Completed", counts.completed],
            ] as const
          ).map(([label, value]) => (
            <GlassPanel className="p-4 sm:p-5" key={label}>
              <p className="label-caps text-secondary">{label}</p>
              <p className="mt-2 font-display text-[36px] leading-none font-light text-on-background">
                {value}
              </p>
            </GlassPanel>
          ))}
        </section>

        <section className="section-shell space-y-5" aria-label="Booking filters and search">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <nav aria-label="Booking status" className="flex flex-wrap gap-2">
              {(
                [
                  ["all", `All (${counts.all})`],
                  ["pending", `Pending (${counts.pending})`],
                  ["confirmed", `Confirmed (${counts.confirmed})`],
                  ["completed", `Completed (${counts.completed})`],
                ] as const
              ).map(([value, label]) => (
                <Link
                  aria-current={view === value ? "page" : undefined}
                  className={`tc-filter-pill ${view === value ? "tc-filter-pill-active" : ""}`}
                  href={buildBookingsHref({ view: value, query: searchQuery })}
                  key={value}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <form
              className="tc-filter-panel flex w-full flex-col gap-3 p-3 sm:flex-row xl:max-w-xl"
              method="get"
            >
              <label className="sr-only" htmlFor="operator-booking-search">
                Search bookings
              </label>
              <input
                className="min-w-0 flex-1 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-background"
                defaultValue={searchQuery}
                id="operator-booking-search"
                name="q"
                placeholder="Traveller, destination, or listing..."
                type="search"
              />
              <input name="view" type="hidden" value={view} />
              <button className="btn-primary btn-sm shrink-0" type="submit">
                Search bookings
              </button>
            </form>
          </div>

          {visibleBookings.length ? (
            <div className="grid gap-5">
              {visibleBookings.map((booking) => {
                const payment = formatPayment(booking);
                const messageHref = booking.latest_conversation_id
                  ? `/OperatorMessages?conversation=${encodeURIComponent(booking.latest_conversation_id)}`
                  : `/OperatorMessages?inquiry=${encodeURIComponent(booking.id)}`;

                return (
                  <GlassPanel className="p-5 sm:p-7" key={booking.id}>
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="label-caps text-secondary">
                            {formatLabel(booking.status, "Submitted")}
                          </span>
                          <span className="rounded-full border border-outline-variant/30 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant">
                            {formatLabel(booking.availability, "Flexible")}
                          </span>
                        </div>
                        <h2 className="mt-3 break-words font-display text-[30px] leading-9 font-light text-on-background">
                          {booking.listing_title || booking.destination || "Custom travel request"}
                        </h2>
                        <p className="mt-2 text-sm text-on-surface-variant">
                          {booking.destination_country || booking.listing_location || "Destination on request"}
                        </p>
                        {booking.notes ? (
                          <p className="mt-4 line-clamp-2 text-sm leading-6 text-on-surface-variant">
                            {booking.notes}
                          </p>
                        ) : null}
                      </div>

                      <div className="grid min-w-0 gap-3 sm:grid-cols-3 lg:w-[540px]">
                        <BookingFact label="Traveller" value={booking.traveler_name || "Traveller"} />
                        <BookingFact label="Travel dates" value={formatBookingDateRange(booking)} />
                        <BookingFact label={`Payment · ${payment.label}`} value={payment.detail} />
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 border-t border-outline-variant/20 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="min-w-0 break-all text-xs text-on-surface-variant">
                        {booking.traveler_email || "Traveller email unavailable"}
                      </p>
                      <Link className="btn-outline btn-sm shrink-0" href={messageHref}>
                        Open messages
                      </Link>
                    </div>
                  </GlassPanel>
                );
              })}
            </div>
          ) : (
            <GlassPanel className="p-6 sm:p-8">
              <h2 className="font-display text-[30px] leading-9 font-light text-on-background">
                No bookings matched.
              </h2>
              <p className="mt-3 text-sm text-on-surface-variant">
                Try a different status or clear the search to see assigned traveler requests.
              </p>
              <Link className="btn-outline btn-sm mt-6" href="/OperatorBookings">
                Clear filters
              </Link>
            </GlassPanel>
          )}
        </section>

        <section className="section-shell flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs uppercase tracking-[0.15em] text-on-surface-variant">
            Showing {visibleBookings.length} of {matchingBookings.length} bookings
          </p>
          <div className="flex items-center gap-3">
            {page > 1 ? (
              <Link
                aria-label="Previous booking page"
                className="btn-outline btn-sm"
                href={buildBookingsHref({ view, query: searchQuery, page: page - 1 })}
              >
                Previous
              </Link>
            ) : (
              <button className="btn-outline btn-sm" disabled type="button">
                Previous
              </button>
            )}
            <span className="text-xs uppercase tracking-[0.15em] text-on-surface-variant">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                aria-label="Next booking page"
                className="btn-outline btn-sm"
                href={buildBookingsHref({ view, query: searchQuery, page: page + 1 })}
              >
                Next
              </Link>
            ) : (
              <button className="btn-outline btn-sm" disabled type="button">
                Next
              </button>
            )}
          </div>
        </section>
      </main>
    </PageShell>
  );
}

function BookingFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
      <p className="label-caps text-secondary">{label}</p>
      <p className="mt-2 break-words text-sm text-on-background">{value}</p>
    </div>
  );
}
