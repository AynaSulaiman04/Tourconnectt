import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/layout/PageShell";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";
import { getPlatformEvents } from "@/lib/supabase/analytics";
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
      labels: months.map((date) => new Intl.DateTimeFormat("en", { month: "short" }).format(date)),
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
    labels: days.map((date) =>
      range === "7d"
        ? new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)
        : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
    ),
    counts: days.map((date) => buckets.get(date.toISOString().slice(0, 10)) ?? 0),
    total: filtered.length,
  };
}

function buildActivityBreakdown(events: Awaited<ReturnType<typeof getPlatformEvents>>, range: DashboardRange) {
  const start = getRangeStart(range);
  const filtered = events.filter((event) => new Date(event.created_at) >= start);
  const categories = [
    {
      label: "Inquiries",
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
  const currentYear = new Date().getFullYear();
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
    <PageShell variant="admin">
      <style>{`
        .main {
          min-height: 100vh;
          padding: 40px var(--page-margin-desktop, 32px) 72px;
        }

        .page-header {
          margin-bottom: 56px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 32px;
        }

        .admin-label {
          color: var(--secondary);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.3em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .page-header h2 {
          margin: 8px 0 0;
          font-family: 'Raleway', sans-serif;
          font-size: clamp(38px, 5vw, 56px);
          line-height: 1.08;
          letter-spacing: -0.03em;
          font-weight: 300;
          color: var(--on-background);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .updated-text {
          text-align: right;
        }

        .updated-text p {
          margin: 0;
        }

        .updated-text p:first-child,
        .stat-card p,
        .section-title,
        .approval-company,
        .update-item-meta {
          color: rgba(75, 70, 61, 0.6);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .updated-text p:last-child {
          font-size: 16px;
          line-height: 24px;
          font-weight: 300;
        }

        .avatar {
          width: 48px;
          height: 48px;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid rgba(206, 197, 185, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 253, 251, 0.8);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 32px;
          margin-bottom: 72px;
        }

        .stat-card {
          padding: 32px;
          min-height: 148px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .stat-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }

        .stat-card h3 {
          margin: 0;
          font-family: 'Raleway', sans-serif;
          font-size: 34px;
          line-height: 40px;
          letter-spacing: -0.02em;
          font-weight: 300;
          color: var(--on-background);
        }

        .stat-change {
          color: var(--secondary);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .stat-change.error {
          color: var(--error);
        }

        .content-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 32px;
          align-items: stretch;
        }

        .activity-card {
          grid-column: span 7;
          min-height: 390px;
          padding: 28px;
          display: flex;
          flex-direction: column;
        }

        .section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          margin-bottom: 28px;
        }

        .section-title {
          margin: 0;
          color: var(--on-background);
        }

        .tabs {
          display: flex;
          gap: 0.6rem;
          padding: 0.85rem;
          border: 1px solid rgba(17, 19, 24, 0.12);
          border-radius: 1.5rem;
          background: rgba(255, 253, 248, 0.92);
          box-shadow: 0 16px 42px rgba(53, 39, 33, 0.08);
        }

        .tabs a,
        .tabs span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 2.5rem;
          padding: 0.62rem 1rem;
          border-radius: 999px;
          border: 1px solid rgba(197, 22, 29, 0.28);
          background: rgba(255, 253, 248, 0.92);
          color: var(--secondary);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
          transition: all 180ms ease;
        }

        .tabs a.active,
        .tabs span.active {
          background: linear-gradient(135deg, var(--tc-red), var(--tc-red-dark));
          color: #fff;
          border-color: rgba(197, 22, 29, 0.34);
          box-shadow: 0 12px 26px rgba(197, 22, 29, 0.18);
        }

        .chart {
          flex: 1;
          min-height: 255px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          padding: 0 8px;
        }

        .bar {
          width: 100%;
          min-height: 120px;
          background: var(--surface-container-high);
          position: relative;
          border-radius: 18px 18px 0 0;
          overflow: hidden;
        }

        .bar-fill {
          position: absolute;
          left: 0;
          bottom: 0;
          width: 100%;
          background: rgba(160, 64, 27, 0.1);
        }

        .bar-line {
          position: absolute;
          left: 0;
          width: 100%;
          height: 1px;
          background: var(--secondary);
        }

        .right-column {
          grid-column: span 5;
          display: flex;
          flex-direction: column;
          gap: 32px;
          min-height: 620px;
        }

        .approvals-card,
        .updates-card {
          padding: 40px;
        }

        .approval-badge {
          padding: 4px 12px;
          border-radius: 999px;
          background: rgba(160, 64, 27, 0.1);
          color: var(--secondary);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .approval-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .approval-top {
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .approval-item h5 {
          margin: 0;
          font-size: 16px;
          line-height: 24px;
          font-weight: 600;
          color: var(--on-background);
        }

        .approval-item p {
          margin: 0;
        }

        .submitted {
          color: rgba(75, 70, 61, 0.4);
          font-size: 11px;
        }

        .approval-line {
          width: 100%;
          height: 1px;
          margin-top: 20px;
          background: rgba(206, 197, 185, 0.1);
        }

        .view-all-btn {
          margin-top: auto;
          width: 100%;
          justify-content: center;
        }

        .updates-card {
          position: relative;
          overflow: hidden;
          height: 230px;
          flex-shrink: 0;
          border-radius: inherit;
          display: flex;
          flex-direction: column;
        }

        .payments-card {
          padding: 40px;
        }

        .payment-list {
          margin-top: 1rem;
          display: grid;
          gap: 0.75rem;
        }

        .payment-item {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 0.95rem 1rem;
          border-radius: 1rem;
          border: 1px solid rgba(206, 197, 185, 0.18);
          background: rgba(255, 253, 251, 0.78);
        }

        .payment-item-title {
          margin: 0;
          color: var(--on-background);
          font-size: 0.95rem;
          line-height: 1.4;
          font-weight: 600;
        }

        .payment-item-body {
          margin: 0.2rem 0 0;
          color: rgba(75, 70, 61, 0.62);
          font-size: 0.82rem;
          line-height: 1.45;
        }

        .payment-item-amount {
          display: grid;
          justify-items: end;
          gap: 0.25rem;
          white-space: nowrap;
        }

        .payment-item-amount strong {
          color: var(--on-background);
          font-size: 1rem;
          line-height: 1.4;
        }

        .payment-item-pill {
          display: inline-flex;
          align-items: center;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          background: rgba(160, 64, 27, 0.1);
          color: var(--secondary);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .updates-list {
          margin-top: 1rem;
          display: grid;
          gap: 0.75rem;
          flex: 1;
          min-height: 0;
          overflow: auto;
        }

        .update-item {
          display: grid;
          gap: 0.35rem;
          padding: 0.9rem 1rem;
          border-radius: 1rem;
          border: 1px solid rgba(206, 197, 185, 0.18);
          background: rgba(255, 253, 251, 0.78);
        }

        .update-item-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .update-item-title {
          margin: 0;
          color: var(--on-background);
          font-size: 0.95rem;
          line-height: 1.4;
          font-weight: 600;
        }

        .update-item-body {
          margin: 0;
          color: rgba(75, 70, 61, 0.62);
          font-size: 0.82rem;
          line-height: 1.45;
        }

        .update-unread {
          width: 0.7rem;
          height: 0.7rem;
          margin-top: 0.2rem;
          border-radius: 999px;
          color: var(--secondary);
          background: var(--secondary);
          flex-shrink: 0;
        }

        .page-footer {
          margin-top: 72px;
          width: 100%;
          padding: 24px 0 0;
          border-top: 1px solid rgba(206, 197, 185, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
        }

        .page-footer p {
          margin: 0;
          color: rgba(75, 70, 61, 0.6);
          font-size: 16px;
          line-height: 24px;
          font-weight: 300;
        }

        .footer-links {
          display: flex;
          gap: 32px;
        }

        .footer-links a {
          color: rgba(75, 70, 61, 0.6);
          font-size: 16px;
          line-height: 24px;
          font-weight: 300;
          transition: all 0.2s ease;
        }

        @media (max-width: 1100px) {
          .main {
            padding: 32px 24px 56px;
          }

          .page-header,
          .page-footer {
            flex-direction: column;
            align-items: flex-start;
          }

          .header-right {
            width: 100%;
            justify-content: space-between;
          }

          .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            margin-bottom: 56px;
          }

          .content-grid {
            grid-template-columns: 1fr;
          }

          .activity-card,
          .right-column {
            grid-column: auto;
            min-height: auto;
          }

          .updates-card {
            height: 280px;
          }
        }

        @media (max-width: 640px) {
          .stats-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }

          .activity-card,
          .approvals-card,
          .updates-card {
            padding: 28px;
          }

          .section-head,
          .approval-top {
            flex-direction: column;
            align-items: flex-start;
          }

          .chart {
            min-height: 260px;
          }
        }
      `}</style>

      <main className="main">
        <header className="page-header">
          <div>
            <span className="admin-label">Administrator</span>
            <h2>Executive Overview</h2>
          </div>

          <div className="header-right flex-wrap">
            <div className="updated-text">
              <p>Last Updated</p>
              <p>{new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(lastUpdated))}</p>
            </div>

            <div className="avatar relative">
              {workspace.profile.profile_image_url ? (
                <Image
                  fill
                  alt={workspace.profile.full_name}
                  className="object-cover"
                  quality={100}
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

        <section className="stats-grid">
          {[
            ["Activity Events", activitySeries.total.toLocaleString(), selectedRangeLabel, false],
            ["Inquiries", visibleInquiries.length.toLocaleString(), "in selected range", false],
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
              <h4 className="section-title">Platform Activity</h4>
              <div className="tabs tc-filter-tabs">
                {(["7d", "30d"] as const).map((range) => (
                  <Link
                    key={range}
                    className={`tc-filter-pill ${range === selectedRange ? "active tc-filter-pill-active" : ""}`}
                    href={`/AdminDashboard?range=${range}`}
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
                <h4 className="section-title">Pending Approvals</h4>
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
                        Submitted: {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(listing.created_at))}
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
                <h4 className="section-title">Admin Updates</h4>
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
                        {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
                          new Date(notification.created_at),
                        )}
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
                <h4 className="section-title">WiPay Collections</h4>
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

        <footer className="page-footer">
          <p>© {currentYear} Tour ConnecTT. All Rights Reserved.</p>
          <div className="footer-links">
            <Link href="/PrivacyPolicy">Privacy Policy</Link>
            <Link href="/TermsOfService">Terms of Service</Link>
            <Link href="/AdminAnalytics">Press</Link>
            <Link href="/AdminSettings">Contact</Link>
          </div>
        </footer>
      </main>
    </PageShell>
  );
}

