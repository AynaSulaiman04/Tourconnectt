import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PortalQuickLinks } from "@/components/admin/PortalQuickLinks";
import { PageShell } from "@/components/layout/PageShell";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getAdminPageShellProps } from "@/lib/admin/page-shell-props";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";
import { getPlatformEvents } from "@/lib/supabase/analytics";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { getRecentPlatformNotifications } from "@/lib/supabase/notifications";
import { isPendingWiPayPayment, isSuccessfulWiPayPayment } from "@/lib/payments/wipay";

type DashboardRange = "7d" | "30d" | "1y";
type PaymentStatusFilter = "all" | "paid" | "pending" | "failed";

type AdminOverviewPageProps = {
  searchParams: Promise<{
    range?: string;
    paymentStatus?: string;
    withdrawal?: string;
    withdrawal_error?: string;
  }>;
};

function normalizeRange(value: string | undefined): DashboardRange {
  if (value === "7d" || value === "30d" || value === "1y") {
    return value;
  }

  return "30d";
}

function getRangeStart(range: DashboardRange) {
  const now = new Date();

  if (range === "1y") {
    now.setDate(now.getDate() - 365);
    now.setHours(0, 0, 0, 0);
    return now;
  }

  now.setDate(now.getDate() - (range === "7d" ? 7 : 30));
  now.setHours(0, 0, 0, 0);
  return now;
}

function buildActivitySeries(events: Awaited<ReturnType<typeof getPlatformEvents>>, range: DashboardRange) {
  const start = getRangeStart(range);
  const filtered = events.filter((event) => new Date(event.created_at) >= start);

  if (range === "1y") {
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (11 - index));
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date;
    });
    const buckets = new Map<string, number>(months.map((date) => [date.toISOString().slice(0, 7), 0]));

    filtered.forEach((event) => {
      const key = new Date(event.created_at).toISOString().slice(0, 7);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    });

    return {
      labels: months.map((date) => formatDate(date)),
      counts: months.map((date) => buckets.get(date.toISOString().slice(0, 7)) ?? 0),
      total: filtered.length,
    };
  }

  const days = Array.from({ length: range === "7d" ? 7 : 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - ((range === "7d" ? 7 : 30) - 1 - index));
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const buckets = new Map<string, number>(days.map((date) => [date.toISOString().slice(0, 10), 0]));

  filtered.forEach((event) => {
    const key = new Date(event.created_at).toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  });

  return {
    labels: days.map((date) => formatDate(date)),
    counts: days.map((date) => buckets.get(date.toISOString().slice(0, 10)) ?? 0),
    total: filtered.length,
  };
}

function buildActivityBreakdown(events: Awaited<ReturnType<typeof getPlatformEvents>>, range: DashboardRange) {
  const start = getRangeStart(range);
  const filtered = events.filter((event) => new Date(event.created_at) >= start);
  const categories = [
    {
      label: "Enquiries",
      color: "rgba(197, 22, 29, 0.92)",
      match: (eventType: string) =>
        eventType === "inquiry_submitted" || eventType === "inquiry_reviewed" || eventType === "inquiry_confirmed" || eventType === "inquiry_closed",
    },
    {
      label: "Listings",
      color: "rgba(180, 122, 22, 0.9)",
      match: (eventType: string) =>
        eventType === "listing_approved" || eventType === "listing_rejected" || eventType === "listing_featured",
    },
    {
      label: "Growth",
      color: "rgba(111, 98, 73, 0.88)",
      match: (eventType: string) => eventType === "referral_click" || eventType === "referral_conversion",
    },
    {
      label: "Admin",
      color: "rgba(17, 19, 24, 0.72)",
      match: (eventType: string) =>
        eventType === "admin_profile_updated" || eventType === "admin_settings_updated" || eventType === "user_status_changed",
    },
  ];

  const used = categories.reduce((sum, category) => {
    const count = filtered.filter((event) => category.match(event.event_type)).length;
    return sum + count;
  }, 0);

  const breakdown = categories.map((category) => ({
    ...category,
    count: filtered.filter((event) => category.match(event.event_type)).length,
  }));

  return {
    breakdown: breakdown.filter((item) => item.count > 0),
    otherCount: Math.max(0, filtered.length - used),
    total: filtered.length,
  };
}

function normalizePaymentStatusFilter(value: string | undefined): PaymentStatusFilter {
  if (value === "paid" || value === "pending" || value === "failed") {
    return value;
  }

  return "all";
}

function buildDashboardHref(range: DashboardRange, paymentStatus: PaymentStatusFilter) {
  const params = new URLSearchParams();
  params.set("range", range);

  if (paymentStatus !== "all") {
    params.set("paymentStatus", paymentStatus);
  }

  return `/AdminDashboard?${params.toString()}`;
}

export default async function AdminOverviewPage({ searchParams }: AdminOverviewPageProps) {
  const resolvedSearchParams = await searchParams;
  const selectedRange = normalizeRange(resolvedSearchParams.range);
  const selectedPaymentStatus = normalizePaymentStatusFilter(resolvedSearchParams.paymentStatus);
  const workspace = await getAdminWorkspaceData();
  const platformEvents = await getPlatformEvents(2000);
  const recentAdminUpdates = await getRecentPlatformNotifications(workspace.profile.id, 3);
  const activitySeries = buildActivitySeries(platformEvents, selectedRange);
  const activityBreakdown = buildActivityBreakdown(platformEvents, selectedRange);
  const lastUpdated =
    workspace.recentListings[0]?.updated_at ??
    workspace.recentBookings[0]?.updated_at ??
    workspace.profile.updated_at;
  const selectedStart = getRangeStart(selectedRange);
  const visibleListings = workspace.listings.filter((listing) => new Date(listing.created_at) >= selectedStart);
  const visibleInquiries = workspace.inquiries.filter((inquiry) => new Date(inquiry.created_at) >= selectedStart);
  const visibleUsers = workspace.users.filter((user) => new Date(user.created_at) >= selectedStart);
  const visibleOperators = visibleUsers.filter((user) => user.role === "operator");
  const selectedRangeLabel = selectedRange === "7d" ? "7 days" : selectedRange === "30d" ? "30 days" : "12 months";
  const visiblePayments = workspace.recentPayments.filter((payment) => {
    if (selectedPaymentStatus === "paid") {
      return isSuccessfulWiPayPayment(payment.status);
    }

    if (selectedPaymentStatus === "pending") {
      return isPendingWiPayPayment(payment.status);
    }

    if (selectedPaymentStatus === "failed") {
      return payment.status === "failed" || payment.status === "error";
    }

    return true;
  });
  const paymentCounts = {
    all: workspace.recentPayments.length,
    paid: workspace.recentPayments.filter((payment) => isSuccessfulWiPayPayment(payment.status)).length,
    pending: workspace.recentPayments.filter((payment) => isPendingWiPayPayment(payment.status)).length,
    failed: workspace.recentPayments.filter((payment) => payment.status === "failed" || payment.status === "error").length,
  };
  const activityPieItems = [
    ...activityBreakdown.breakdown,
    activityBreakdown.otherCount > 0 ? { label: "Other", color: "rgba(17, 19, 24, 0.12)", count: activityBreakdown.otherCount } : null,
  ].filter(Boolean) as Array<{ label: string; color: string; count: number }>;
  const activityPieSegments = activityPieItems.reduce<
    Array<{ label: string; color: string; count: number; start: number; end: number }>
  >((segments, item) => {
    const start = segments.length ? segments[segments.length - 1].end : 0;
    const end = start + (item.count / Math.max(1, activityBreakdown.total)) * 100;
    segments.push({ ...item, start, end });
    return segments;
  }, []);
  const dashboardHref = buildDashboardHref(selectedRange, selectedPaymentStatus);
  const withdrawalMessage = resolvedSearchParams.withdrawal === "requested" ? "Withdrawal request sent." : null;
  const withdrawalErrorMessage =
    resolvedSearchParams.withdrawal_error === "no_balance"
      ? "No withdrawable balance is available yet."
      : resolvedSearchParams.withdrawal_error === "request_failed"
        ? "We could not send that withdrawal request. Please try again."
        : null;

  return (
    <PageShell {...getAdminPageShellProps(workspace.profile)}>

      <main className="portal-list-page">
        <header className="page-header">
          <div>
            <span className="admin-label">Administrator</span>
            <h1>Executive Overview</h1>
          </div>

          <div className="header-right flex-wrap">
            <div className="updated-text">
              <p>Last Updated</p>
              <p>{formatDate(lastUpdated)}</p>
            </div>

            <div className="avatar relative">
              {workspace.profile.profile_image_url ? (
                <Image
                  fill
                  alt={workspace.profile.full_name}
                  className="object-cover"
                  sizes="48px"
                  src={workspace.profile.profile_image_url}
                />
              ) : (
                <span className="font-body-md text-secondary">
                  {workspace.profile.full_name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("") || "TT"}
                </span>
              )}
            </div>
          </div>
        </header>

        <div style={{ marginBottom: 24 }}>
          <PortalQuickLinks variant="admin" />
        </div>

        {withdrawalMessage ? (
          <div className="mb-6">
            <StatusMessage tone="success">{withdrawalMessage}</StatusMessage>
          </div>
        ) : null}
        {withdrawalErrorMessage ? (
          <div className="mb-6">
            <StatusMessage tone="error">{withdrawalErrorMessage}</StatusMessage>
          </div>
        ) : null}

        <section className="stats-grid">
          {[
            ["Activity Events", activitySeries.total.toLocaleString(), selectedRangeLabel, false],
            ["Enquiries", visibleInquiries.length.toLocaleString(), "in selected range", false],
            ["Listings", visibleListings.length.toLocaleString(), "published or updated", false],
            ["Operators", visibleOperators.length.toLocaleString(), "new or active in range", false],
          ].map(([label, value, change, isError]) => (
            <div key={label as string} className="stat-card glass-panel">
              <p>{label}</p>
              <div className="stat-row">
                <h3>{value}</h3>
                <span className={`stat-change ${isError ? "error" : ""}`}>{change}</span>
              </div>
            </div>
          ))}
        </section>

        <div className="content-grid">
          <section className="activity-card glass-panel">
            <div className="section-head">
              <h4 className="panel-label">Platform Activity</h4>
              <div className="tabs tc-filter-tabs">
                {(["7d", "30d"] as const).map((range) => (
                  <Link
                    key={range}
                    className={`tc-filter-pill ${range === selectedRange ? "active tc-filter-pill-active" : ""}`}
                    href={buildDashboardHref(range, selectedPaymentStatus)}
                  >
                    {range.toUpperCase()}
                  </Link>
                ))}
              </div>
            </div>

            {activityBreakdown.total > 0 ? (
              <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
                <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full border border-outline-variant/20 bg-surface-container-low/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]">
                  <div
                    className="flex h-44 w-44 items-center justify-center rounded-full border border-outline-variant/20 bg-surface-container-lowest"
                    style={{
                      background: `conic-gradient(${activityPieSegments
                        .map((item) => `${item.color} ${item.start}% ${item.end}%`)
                        .join(", ")})`,
                    }}
                  >
                    <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full border border-outline-variant/20 bg-surface-container-lowest text-center">
                      <span className="label-caps text-secondary">Activity</span>
                      <strong className="mt-2 font-display text-4xl leading-none tracking-[-0.04em] text-on-background">
                        {activityBreakdown.total}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  {activityPieItems.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3">
                        <div className="flex items-center gap-3">
                        <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-body-md text-on-background">{item.label}</span>
                        </div>
                      <span className="label-caps text-secondary">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

          </section>

          <section className="right-column">
            <div className="approvals-card glass-panel">
              <div className="section-head">
                <h4 className="panel-label">Pending Approvals</h4>
                <span className="approval-badge">{workspace.pendingListings.length} New</span>
              </div>

              <div className="approval-list">
                {workspace.pendingListings.length ? (
                  workspace.pendingListings.map((listing) => (
                    <div className="approval-item" key={listing.id}>
                      <div className="approval-top">
                        <div>
                          <h5>{listing.title}</h5>
                          <p className="approval-company">{listing.operator_name}</p>
                        </div>
                        <Button href="/AdminListings" variant="outline" className="px-4 py-2 min-h-0">
                          Review
                        </Button>
                      </div>
                      <p className="submitted">
                        Submitted: {formatDate(listing.created_at)}
                      </p>
                      <div className="approval-line" />
                    </div>
                  ))
                ) : (
                  <p className="submitted">No listings are waiting for approval right now.</p>
                )}
              </div>

              <Button href="/AdminListings" variant="primary" className="view-all-btn">
                View All Submissions
              </Button>
            </div>

            <div className="updates-card glass-panel">
              <div className="section-head">
                <h4 className="panel-label">Admin Updates</h4>
                <span className="approval-badge">{recentAdminUpdates.filter((item) => !item.read_at).length} New</span>
              </div>

              {recentAdminUpdates.length ? (
                <div className="updates-list">
                  {recentAdminUpdates.map((notification) => (
                    <Link
                      key={notification.id}
                      className="update-item"
                      href={notification.href ?? "/AdminDashboard"}
                    >
                      <div className="update-item-top">
                        <div>
                          <p className="update-item-title">{notification.title}</p>
                          <p className="update-item-body">{notification.body}</p>
                        </div>
                        {!notification.read_at ? <span className="update-unread" aria-hidden="true" /> : null}
                      </div>
                      <p className="update-item-meta">
                        {formatDateTime(notification.created_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="submitted">Admin updates will appear here when listings, inquiries, users, or bookings change.</p>
              )}
            </div>

            <div className="payments-card glass-panel">
              <div className="section-head">
                <h4 className="panel-label">WiPay Collections</h4>
                <span className="approval-badge">{workspace.stats.paymentCount.toLocaleString()} Paid</span>
              </div>

              <div className="flex flex-wrap gap-2" style={{ marginBottom: 20 }}>
                {[
                  ["all", `All (${paymentCounts.all})`],
                  ["paid", `Paid (${paymentCounts.paid})`],
                  ["pending", `Pending (${paymentCounts.pending})`],
                  ["failed", `Failed (${paymentCounts.failed})`],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    href={buildDashboardHref(selectedRange, value as PaymentStatusFilter)}
                    variant={selectedPaymentStatus === value ? "primary" : "outline"}
                    className="px-4 py-2 min-h-0"
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="stat-row" style={{ marginBottom: 20 }}>
                <h3>{new Intl.NumberFormat("en-US", { style: "currency", currency: "TTD", maximumFractionDigits: 2 }).format(workspace.stats.monthlyRevenue)}</h3>
                <span className="stat-change">Gross</span>
              </div>

              <div className="flex flex-wrap gap-4" style={{ marginBottom: 20 }}>
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3">
                  <div className="label-caps text-secondary mb-1">Admin 20%</div>
                  <strong style={{ color: "var(--on-background)" }}>
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "TTD", maximumFractionDigits: 2 }).format(workspace.stats.adminCommissionTotal)}
                  </strong>
                </div>
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3">
                  <div className="label-caps text-secondary mb-1">Operator 80%</div>
                  <strong style={{ color: "var(--on-background)" }}>
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "TTD", maximumFractionDigits: 2 }).format(workspace.stats.operatorPayoutTotal)}
                  </strong>
                </div>
              </div>

              <div className="flex flex-wrap gap-3" style={{ marginBottom: 20 }}>
                <form action="/api/admin/withdrawals/request" method="post">
                  <input name="return_to" type="hidden" value={dashboardHref} />
                  <button className="btn-primary px-4 py-2 min-h-0" disabled={workspace.stats.adminCommissionTotal <= 0} type="submit">
                    Request withdrawal
                  </button>
                </form>
                <Button href="/AdminBookings?tab=payments&paymentStatus=paid" variant="outline" className="px-4 py-2 min-h-0">
                  View paid payments
                </Button>
              </div>

              {visiblePayments.length ? (
                <div className="payment-list">
                  {visiblePayments.map((payment) => {
                    const amount = new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: payment.currency === "USD" ? "USD" : "TTD",
                      maximumFractionDigits: 2,
                    }).format(Number.parseFloat(payment.amount));

                    return (
                      <div key={payment.id} className="payment-item">
                        <div>
                          <p className="payment-item-title">{payment.listing_title ?? "Travel payment"}</p>
                          <p className="payment-item-body">
                            {payment.traveler_name}
                            {payment.operator_name ? ` · ${payment.operator_name}` : ""}
                          </p>
                        </div>
                        <div className="payment-item-amount">
                          <strong>{amount}</strong>
                          <span className="payment-item-pill">{payment.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="submitted">No WiPay collections have been recorded yet.</p>
              )}
            </div>
          </section>
        </div>
      </main>
    </PageShell>
  );
}

