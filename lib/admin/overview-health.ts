import type { AdminWorkspaceData } from "@/lib/supabase/admin";

/**
 * Derives the signals the admin overview reports on.
 *
 * Everything here is computed from records the workspace query already returns
 * -- nothing is estimated or invented. A number that cannot be derived honestly
 * is not shown at all.
 */

export type Severity = "critical" | "warn" | "ok";

export type AttentionItem = {
  id: string;
  label: string;
  /** What the number means, and what happens if it is ignored. */
  detail: string;
  count: number;
  href: string;
  severity: Severity;
};

export type HealthMetric = {
  id: string;
  label: string;
  value: string;
  /** Period-over-period change, or null when there is no comparable window. */
  delta: number | null;
  deltaLabel: string | null;
  hint: string;
  href: string;
};

export type Funnel = {
  enquiries: number;
  confirmed: number;
  paid: number;
  confirmRate: number;
  payRate: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Enquiries older than this with no operator response are treated as stalled. */
const STALE_ENQUIRY_DAYS = 3;

function countWithin<T extends { created_at: string }>(rows: T[], from: Date, to?: Date) {
  const start = from.getTime();
  const end = to ? to.getTime() : Number.POSITIVE_INFINITY;
  return rows.filter((row) => {
    const at = new Date(row.created_at).getTime();
    return Number.isFinite(at) && at >= start && at < end;
  }).length;
}

/**
 * Change against the immediately preceding window of the same length, so "30d"
 * compares the last 30 days with the 30 before that.
 *
 * Returns null when the earlier window is empty: a jump from 0 to 5 is not a
 * "500% rise", and presenting it as one would be misleading on a young site.
 */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

export function buildAttentionItems(workspace: AdminWorkspaceData): AttentionItem[] {
  const now = Date.now();

  const pendingListings = workspace.stats.pendingListings;

  const stalledEnquiries = workspace.inquiries.filter(
    (inquiry) =>
      inquiry.status === "submitted" &&
      now - new Date(inquiry.created_at).getTime() > STALE_ENQUIRY_DAYS * DAY_MS,
  ).length;

  const failedPayments = workspace.recentPayments.filter(
    (payment) => payment.status === "failed" || payment.status === "error",
  ).length;

  // Directly actionable: a listing with no category is invisible to every
  // category filter on /Experiences, so travellers cannot find it.
  const uncategorisedLive = workspace.listings.filter(
    (listing) => (listing.status === "live" || listing.is_active) && !listing.category,
  ).length;

  const items: AttentionItem[] = [
    {
      id: "pending-listings",
      label: "Listings awaiting review",
      detail: "Operators cannot sell these until they are approved.",
      count: pendingListings,
      href: "/AdminListings",
      severity: pendingListings > 0 ? "warn" : "ok",
    },
    {
      id: "stalled-enquiries",
      label: `Enquiries unanswered over ${STALE_ENQUIRY_DAYS} days`,
      detail: "Still marked submitted, with no operator response.",
      count: stalledEnquiries,
      href: "/AdminBookings",
      severity: stalledEnquiries > 0 ? "critical" : "ok",
    },
    {
      id: "failed-payments",
      label: "Failed payments",
      detail: "A traveller tried to pay and could not.",
      count: failedPayments,
      href: "/AdminBookings?tab=payments&paymentStatus=failed",
      severity: failedPayments > 0 ? "critical" : "ok",
    },
    {
      id: "uncategorised",
      label: "Live listings with no category",
      detail: "These are missing from every category filter on Experiences.",
      count: uncategorisedLive,
      href: "/AdminListings",
      severity: uncategorisedLive > 0 ? "warn" : "ok",
    },
  ];

  // Worst first, and within a severity the largest backlog first.
  const order: Record<Severity, number> = { critical: 0, warn: 1, ok: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
}

export function buildHealthMetrics(
  workspace: AdminWorkspaceData,
  rangeStart: Date,
  rangeLabel: string,
  formatMoney: (value: number) => string,
): HealthMetric[] {
  const spanMs = Date.now() - rangeStart.getTime();
  const previousStart = new Date(rangeStart.getTime() - spanMs);

  const travellers = workspace.users.filter((user) => user.role === "traveler");
  const operators = workspace.users.filter((user) => user.role === "operator");

  function metric(
    id: string,
    label: string,
    rows: Array<{ created_at: string }>,
    total: number,
    hint: string,
    href: string,
  ): HealthMetric {
    const current = countWithin(rows, rangeStart);
    const previous = countWithin(rows, previousStart, rangeStart);
    const delta = percentChange(current, previous);

    return {
      id,
      label,
      value: total.toLocaleString(),
      delta,
      deltaLabel: delta === null ? `+${current} in ${rangeLabel}` : `vs previous ${rangeLabel}`,
      hint,
      href,
    };
  }

  return [
    metric("travellers", "Travellers", travellers, travellers.length, "Registered traveller accounts.", "/AdminUsers"),
    metric("operators", "Operators", operators, operators.length, "Operator accounts on the platform.", "/AdminUsers"),
    metric(
      "listings",
      "Live listings",
      workspace.listings.filter((listing) => listing.status === "live" || listing.is_active),
      workspace.stats.liveListings,
      "Bookable right now.",
      "/AdminListings",
    ),
    metric("enquiries", "Enquiries", workspace.inquiries, workspace.inquiries.length, "All enquiries received.", "/AdminBookings"),
    {
      id: "confirmed",
      label: "Confirmed bookings",
      value: workspace.stats.confirmedBookings.toLocaleString(),
      delta: null,
      deltaLabel: `${workspace.stats.pendingBookings} awaiting reply`,
      hint: "Operator has agreed the trip.",
      href: "/AdminBookings",
    },
    {
      id: "revenue",
      label: "Collected",
      value: formatMoney(workspace.stats.monthlyRevenue),
      delta: null,
      deltaLabel: `${workspace.stats.paymentCount} successful payments`,
      hint: "Paid through WiPay.",
      href: "/AdminBookings?tab=payments&paymentStatus=paid",
    },
  ];
}

export function buildFunnel(workspace: AdminWorkspaceData): Funnel {
  const enquiries = workspace.inquiries.length;
  const confirmed = workspace.stats.confirmedBookings;
  const paid = workspace.stats.paymentCount;

  return {
    enquiries,
    confirmed,
    paid,
    confirmRate: enquiries > 0 ? (confirmed / enquiries) * 100 : 0,
    payRate: confirmed > 0 ? (paid / confirmed) * 100 : 0,
  };
}

/**
 * A single headline read on the platform, driven by whether anything is
 * actually wrong rather than by a score with no meaning behind it.
 */
export function summarise(items: AttentionItem[]): { severity: Severity; headline: string } {
  const critical = items.filter((item) => item.severity === "critical" && item.count > 0);
  const warn = items.filter((item) => item.severity === "warn" && item.count > 0);

  const total = (list: AttentionItem[]) => list.reduce((sum, item) => sum + item.count, 0);

  if (critical.length > 0) {
    const n = total(critical);
    return {
      severity: "critical",
      headline: n === 1 ? "1 thing needs attention now" : `${n} things need attention now`,
    };
  }

  if (warn.length > 0) {
    const n = total(warn);
    return {
      severity: "warn",
      headline: n === 1 ? "1 item is waiting on you" : `${n} items are waiting on you`,
    };
  }

  return { severity: "ok", headline: "Everything is clear" };
}
