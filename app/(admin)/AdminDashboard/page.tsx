import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";
import { getPlatformEvents } from "@/lib/supabase/analytics";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { getRecentPlatformNotifications } from "@/lib/supabase/notifications";
import { isPendingWiPayPayment, isSuccessfulWiPayPayment } from "@/lib/payments/wipay";
import {
  buildAttentionItems,
  buildFunnel,
  buildHealthMetrics,
  summarise,
} from "@/lib/admin/overview-health";
import "./overview.css";

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
  const activityBreakdown = buildActivityBreakdown(platformEvents, selectedRange);
  const lastUpdated =
    workspace.recentListings[0]?.updated_at ??
    workspace.recentBookings[0]?.updated_at ??
    workspace.profile.updated_at;
  const selectedStart = getRangeStart(selectedRange);
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
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "TTD",
      maximumFractionDigits: 0,
    }).format(value);
  const attentionItems = buildAttentionItems(workspace);
  const healthMetrics = buildHealthMetrics(workspace, selectedStart, selectedRangeLabel, money);
  const funnel = buildFunnel(workspace);
  const health = summarise(attentionItems);
  const peakActivity = Math.max(1, ...workspace.activityTimeline.map((day) => day.count));
  const withdrawalMessage = resolvedSearchParams.withdrawal === "requested" ? "Withdrawal request sent." : null;
  const withdrawalErrorMessage =
    resolvedSearchParams.withdrawal_error === "no_balance"
      ? "No withdrawable balance is available yet."
      : resolvedSearchParams.withdrawal_error === "request_failed"
        ? "We could not send that withdrawal request. Please try again."
        : null;

  return (
    <>

      <main className="portal-list-page">
        <header className="page-header ov-header">
          <div>
            <span className="admin-label">Administrator</span>
            <h1>Overview</h1>
            <p className={`ov-health ov-health-${health.severity}`}>
              <span className="ov-health-dot" aria-hidden="true" />
              {health.headline}
            </p>
          </div>

          <div className="header-right flex-wrap">
            <div className="ov-range" role="group" aria-label="Reporting period">
              {(["7d", "30d", "1y"] as const).map((range) => (
                <Link
                  key={range}
                  className={`ov-range-pill ${range === selectedRange ? "is-active" : ""}`}
                  href={buildDashboardHref(range, selectedPaymentStatus)}
                  aria-current={range === selectedRange ? "true" : undefined}
                >
                  {range === "7d" ? "7 days" : range === "30d" ? "30 days" : "12 months"}
                </Link>
              ))}
            </div>

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

        <section className="ov-attention" aria-labelledby="needs-attention">
          <h2 className="ov-section-title" id="needs-attention">
            Needs attention
          </h2>
          <div className="ov-attention-grid">
            {attentionItems.map((item) => (
              <Link
                className={`ov-attention-card is-${item.severity}`}
                href={item.href}
                key={item.id}
              >
                <span className="ov-attention-count">{item.count}</span>
                <span className="ov-attention-label">{item.label}</span>
                <span className="ov-attention-detail">{item.detail}</span>
                <span className="ov-attention-go" aria-hidden="true">
                  {item.count > 0 ? "Review →" : "All clear"}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="ov-metrics" aria-labelledby="platform-health">
          <h2 className="ov-section-title" id="platform-health">
            Platform
          </h2>
          <div className="ov-metric-grid">
            {healthMetrics.map((metric) => (
              <Link className="ov-metric" href={metric.href} key={metric.id}>
                <span className="ov-metric-label">{metric.label}</span>
                <strong className="ov-metric-value">{metric.value}</strong>
                <span
                  className={`ov-metric-delta ${
                    metric.delta === null ? "" : metric.delta >= 0 ? "is-up" : "is-down"
                  }`}
                >
                  {metric.delta === null
                    ? metric.deltaLabel
                    : `${metric.delta >= 0 ? "▲" : "▼"} ${Math.abs(metric.delta).toFixed(0)}% ${metric.deltaLabel}`}
                </span>
                <span className="ov-metric-hint">{metric.hint}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="ov-funnel" aria-labelledby="conversion">
          <h2 className="ov-section-title" id="conversion">
            Enquiry to payment
          </h2>
          <div className="ov-funnel-track">
            {[
              { label: "Enquiries", value: funnel.enquiries, pct: 100, href: "/AdminBookings" },
              {
                label: "Confirmed",
                value: funnel.confirmed,
                pct: funnel.confirmRate,
                href: "/AdminBookings",
              },
              {
                label: "Paid",
                value: funnel.paid,
                pct: funnel.enquiries > 0 ? (funnel.paid / funnel.enquiries) * 100 : 0,
                href: "/AdminBookings?tab=payments&paymentStatus=paid",
              },
            ].map((stage) => (
              <Link className="ov-funnel-stage" href={stage.href} key={stage.label}>
                <span className="ov-funnel-head">
                  <span className="ov-funnel-label">{stage.label}</span>
                  <strong className="ov-funnel-value">{stage.value.toLocaleString()}</strong>
                </span>
                <span className="ov-funnel-bar" aria-hidden="true">
                  <span className="ov-funnel-fill" style={{ width: `${Math.max(2, stage.pct)}%` }} />
                </span>
                <span className="ov-funnel-pct">{stage.pct.toFixed(0)}% of enquiries</span>
              </Link>
            ))}
          </div>
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
            ) : (
              <div className="ov-activity-empty">
                <p>No activity recorded in the last {selectedRangeLabel}.</p>
                <p className="ov-activity-empty-hint">
                  Events appear here as listings, enquiries, bookings and users change.
                </p>
              </div>
            )}

            <div className="ov-spark" aria-label="Activity over the last 7 days">
              {workspace.activityTimeline.map((day) => (
                <span className="ov-spark-col" key={day.day} title={`${day.day}: ${day.count}`}>
                  <span
                    className="ov-spark-bar"
                    style={{ height: `${Math.round((day.count / peakActivity) * 100)}%` }}
                  />
                  <span className="ov-spark-day">{day.day.slice(5)}</span>
                </span>
              ))}
            </div>
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
    </>
  );
}

