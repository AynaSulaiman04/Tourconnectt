import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/layout/PageShell";
import { OperatorDashboardLiveRefresh } from "@/components/navigation/OperatorDashboardLiveRefresh";
import { getOperatorDashboardData } from "@/lib/supabase/operator-dashboard";
import { isPendingWiPayPayment, isSuccessfulWiPayPayment, resolveWiPayInquiryAmount } from "@/lib/payments/wipay";

type OperatorListing = {
  id: string;
  title: string;
  location: string | null;
  country: string | null;
  duration: string | null;
  summary: string | null;
  image_url: string | null;
  price: string | null;
  operator_id: string | null;
  operator_name: string;
  featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type OperatorInquiry = {
  id: string;
  listing_id: string | null;
  traveler_name: string;
  traveler_email: string;
  destination: string;
  destination_country: string;
  operator_name: string;
  operator_id: string | null;
  preferred_start_date: string | null;
  preferred_end_date: string | null;
  availability: string;
  notes: string | null;
  status: "submitted" | "reviewed" | "confirmed" | "closed";
  created_at: string;
  updated_at: string;
  listing: OperatorListing | null;
};

type PaymentStatusFilter = "all" | "paid" | "pending" | "failed";

type OperatorDashboardPageProps = {
  searchParams: Promise<{
    paymentStatus?: string;
    withdrawal?: string;
    withdrawal_error?: string;
  }>;
};

function formatRelativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

  if (diffHours < 1) {
    return "Just now";
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  return diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;
}

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "Operator";
}

const revenueFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TTD",
  maximumFractionDigits: 0,
});

function getStatusLabel(status: OperatorInquiry["status"]) {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "reviewed":
      return "Reviewing";
    case "closed":
      return "Closed";
    default:
      return "New";
  }
}

function getStatusTone(status: OperatorInquiry["status"]) {
  switch (status) {
    case "confirmed":
      return "status-reviewing";
    case "reviewed":
      return "status-pending";
    case "closed":
      return "status-pending";
    default:
      return "status-new";
  }
}

function normalizePaymentStatusFilter(value: string | undefined): PaymentStatusFilter {
  if (value === "paid" || value === "pending" || value === "failed") {
    return value;
  }

  return "all";
}

function buildDashboardHref(paymentStatus: PaymentStatusFilter) {
  const params = new URLSearchParams();

  if (paymentStatus !== "all") {
    params.set("paymentStatus", paymentStatus);
  }

  const query = params.toString();
  return query ? `/OperatorDashboard?${query}` : "/OperatorDashboard";
}

function normalizeSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "TTD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getConversationHref(conversation: {
  launch_href: string | null;
  inquiry_id: string | null;
  id: string;
}) {
  if (conversation.launch_href) {
    return conversation.launch_href;
  }

  if (conversation.inquiry_id) {
    return `/OperatorMessages?inquiry=${conversation.inquiry_id}`;
  }

  return `/OperatorMessages?conversation=${conversation.id}`;
}

export default async function OperatorDashboardPage({ searchParams }: OperatorDashboardPageProps) {
  const resolvedSearchParams = await searchParams;
  const dashboard = await getOperatorDashboardData();
  const selectedPaymentStatus = normalizePaymentStatusFilter(resolvedSearchParams.paymentStatus);
  const withdrawalMessage = normalizeSearchParam(resolvedSearchParams.withdrawal);
  const withdrawalErrorMessage = normalizeSearchParam(resolvedSearchParams.withdrawal_error);
  const firstName = getFirstName(dashboard.profile.full_name);
  const paymentRecords = dashboard.payments;
  const visiblePayments = paymentRecords.filter((payment) => {
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
    all: paymentRecords.length,
    paid: paymentRecords.filter((payment) => isSuccessfulWiPayPayment(payment.status)).length,
    pending: paymentRecords.filter((payment) => isPendingWiPayPayment(payment.status)).length,
    failed: paymentRecords.filter((payment) => payment.status === "failed" || payment.status === "error").length,
  };
  const unreadMessages = dashboard.directMessageState.conversations.reduce((total, conversation) => total + conversation.unread_count, 0);
  const operatorPayoutBalance = dashboard.operatorPayoutBalance;
  const recentConversations = [...dashboard.directMessageState.conversations]
    .sort((left, right) => new Date((right.last_message_at ?? right.updated_at)).getTime() - new Date((left.last_message_at ?? left.updated_at)).getTime())
    .slice(0, 4);

  return (
    <PageShell
      travelerProfile={{
        id: dashboard.profile.id,
        full_name: dashboard.profile.full_name,
        profile_image_url: dashboard.profile.profile_image_url,
        role: dashboard.profile.role,
      }}
      variant="operator"
    >
      <OperatorDashboardLiveRefresh profileId={dashboard.profile.id} />
      <style>{`
        .operator-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(167, 67, 31, 0.04), transparent 28%),
            radial-gradient(circle at top right, rgba(111, 98, 73, 0.035), transparent 30%),
            var(--background);
          color: var(--on-surface);
        }

        .wrap {
          max-width: 1440px;
          margin: 0 auto;
          padding: 96px 80px 120px;
        }

        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
          gap: 32px;
          align-items: end;
        }

        .eyebrow {
          margin: 0;
          color: var(--secondary);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .title {
          margin: 10px 0 0;
          font-family: var(--font-display);
          font-size: clamp(3.5rem, 7vw, 6.5rem);
          line-height: 0.92;
          letter-spacing: -0.05em;
          font-weight: 300;
          text-transform: lowercase;
        }

        .copy {
          max-width: 720px;
          margin: 18px 0 0;
          color: var(--on-surface-variant);
          font-size: 18px;
          line-height: 28px;
          font-weight: 300;
        }

        .hero-side {
          display: grid;
          gap: 16px;
          justify-items: end;
        }

        .date-pill {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 0.9rem 1.2rem;
        }

        .date-pill span:last-child {
          font-size: 11px;
          line-height: 16px;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 12px;
        }

        .dashboard-button-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .dashboard-filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
          margin-bottom: 1.25rem;
          padding: 1rem;
          border: 1px solid rgba(17, 19, 24, 0.12);
          border-radius: 1.5rem;
          background: rgba(255, 253, 248, 0.92);
          box-shadow: 0 16px 42px rgba(53, 39, 33, 0.08);
        }

        .operator-filter-button {
          background: rgba(255, 253, 248, 0.92);
          color: var(--secondary);
          border-color: rgba(197, 22, 29, 0.28);
          box-shadow: none;
        }

        .operator-filter-button:hover {
          background: rgba(197, 22, 29, 0.05);
          color: var(--secondary);
          border-color: rgba(197, 22, 29, 0.4);
        }

        .operator-filter-button.is-active {
          background: linear-gradient(135deg, var(--tc-red), var(--tc-red-dark));
          color: #fff;
          border-color: rgba(197, 22, 29, 0.34);
          box-shadow: 0 12px 26px rgba(197, 22, 29, 0.18);
        }

        .operator-button-inline {
          display: inline-flex;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 24px;
          margin-top: 36px;
        }

        .stat-card {
          padding: 28px;
          min-height: 158px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .stat-label {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .stat-value {
          margin: 0;
          font-family: var(--font-display);
          font-size: 3.2rem;
          line-height: 1;
          letter-spacing: -0.04em;
          font-weight: 300;
          color: var(--on-surface);
        }

        .stat-copy {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 14px;
          line-height: 22px;
        }

        .stat-change {
          display: inline-flex;
          align-items: center;
          min-height: 1.9rem;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          border: 1px solid rgba(167, 67, 31, 0.16);
          background: rgba(167, 67, 31, 0.06);
          color: var(--secondary);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .stat-footnote {
          margin: 0;
          color: rgba(90, 82, 75, 0.8);
          font-size: 12px;
          line-height: 18px;
        }

        .content-grid {
          margin-top: 32px;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 24px;
          align-items: start;
        }

        .payment-grid {
          margin-top: 24px;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 24px;
        }

        .panel {
          padding: 28px;
        }

        .panel-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 22px;
        }

        .panel-head h3 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 2rem;
          line-height: 1.08;
          letter-spacing: -0.04em;
          font-weight: 300;
          color: var(--on-surface);
        }

        .list {
          display: grid;
          gap: 16px;
        }

        .payment-list {
          display: grid;
          gap: 14px;
        }

        .payment-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 0;
          border-bottom: 1px solid rgba(206, 197, 185, 0.18);
        }

        .payment-row:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .payment-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.2rem;
          line-height: 1.15;
          font-weight: 300;
        }

        .payment-meta {
          margin: 4px 0 0;
          color: var(--on-surface-variant);
          font-size: 13px;
          line-height: 20px;
        }

        .payment-amount {
          display: grid;
          justify-items: end;
          gap: 6px;
          white-space: nowrap;
        }

        .payment-amount strong {
          font-size: 18px;
          line-height: 24px;
          color: var(--on-surface);
        }

        .payment-pill {
          display: inline-flex;
          align-items: center;
          min-height: 1.9rem;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          border: 1px solid rgba(167, 67, 31, 0.16);
          background: rgba(167, 67, 31, 0.06);
          color: var(--secondary);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .thread {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 16px;
          align-items: center;
          padding: 16px 0;
          border-bottom: 1px solid rgba(206, 197, 185, 0.18);
        }

        .thread:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .thread-thumb {
          width: 68px;
          height: 68px;
          border-radius: 18px;
          overflow: hidden;
          background: var(--surface-container-high);
          border: 1px solid rgba(206, 197, 185, 0.2);
          position: relative;
          flex: 0 0 auto;
        }

        .thread-thumb img {
          object-fit: cover;
        }

        .thread-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.35rem;
          line-height: 1.15;
          font-weight: 300;
        }

        .thread-meta,
        .thread-copy {
          margin: 4px 0 0;
          color: var(--on-surface-variant);
          font-size: 14px;
          line-height: 22px;
          font-weight: 300;
        }

        .thread-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
        }

        .commission-panel {
          display: grid;
          gap: 18px;
        }

        .commission-amount {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(2.8rem, 4vw, 4.6rem);
          line-height: 0.95;
          letter-spacing: -0.05em;
          font-weight: 300;
          color: var(--on-surface);
        }

        .commission-note {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 14px;
          line-height: 22px;
          font-weight: 300;
        }

        .thread-status {
          display: inline-flex;
          align-items: center;
          min-height: 2rem;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .status-new {
          border: 1px solid rgba(167, 67, 31, 0.2);
          color: var(--secondary);
          background: rgba(167, 67, 31, 0.06);
        }

        .status-pending {
          border: 1px solid rgba(180, 122, 22, 0.16);
          color: var(--tc-gold);
          background: rgba(180, 122, 22, 0.06);
        }

        .status-reviewing {
          border: 1px solid rgba(111, 98, 73, 0.18);
          color: var(--primary);
          background: rgba(111, 98, 73, 0.06);
        }

        .footer {
          margin-top: 32px;
          padding-top: 28px;
          border-top: 1px solid rgba(206, 197, 185, 0.16);
          display: flex;
          justify-content: space-between;
          gap: 16px;
          color: rgba(75, 70, 61, 0.6);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .footer-links {
          display: flex;
          flex-wrap: wrap;
          gap: 16px 24px;
        }

        @media (max-width: 1100px) {
          .wrap {
            padding: 88px 24px 100px;
          }

          .hero,
          .content-grid {
            grid-template-columns: 1fr;
          }

          .hero-side {
            justify-items: start;
          }

          .hero-actions {
            justify-content: flex-start;
          }

          .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 680px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }

          .thread {
            grid-template-columns: 1fr;
            align-items: start;
          }

          .thread-status {
            justify-self: start;
          }

          .footer {
            flex-direction: column;
          }
        }
      `}</style>

      <main className="operator-page">
        <div className="wrap">
          {withdrawalErrorMessage ? (
            <section className="glass-panel panel" style={{ marginBottom: 24 }}>
              <p className="eyebrow">Withdrawal update</p>
              <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)", fontSize: "2rem", lineHeight: 1.08, fontWeight: 300 }}>
                Request failed
              </h3>
              <p className="thread-copy">{withdrawalErrorMessage}</p>
            </section>
          ) : null}
          {withdrawalMessage ? (
            <section className="glass-panel panel" style={{ marginBottom: 24 }}>
              <p className="eyebrow">Withdrawal update</p>
              <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)", fontSize: "2rem", lineHeight: 1.08, fontWeight: 300 }}>
                Withdrawal request received
              </h3>
              <p className="thread-copy">
                Your request is now with the admin team and will be reviewed against your successful WiPay balance.
              </p>
            </section>
          ) : null}
          <section className="hero">
            <div>
              <p className="eyebrow">Operator portal</p>
              <h1 className="title">Hello, {firstName}</h1>
              <p className="copy">
                {dashboard.liveListingsCount > 0
                  ? `${dashboard.liveListingsCount} listings and ${dashboard.pendingInquiriesCount} pending inquiries are ready for review.`
                  : "Your operator workspace is ready for listings and inquiries."}
              </p>
            </div>

            <div className="hero-side">
              <div className="date-pill glass-panel">
                <span className="material-symbols-outlined">calendar_month</span>
                <span>
                  {dashboard.unreadNotificationsCount > 0
                    ? `Live operator workspace - ${dashboard.unreadNotificationsCount} unread notifications`
                    : "Live operator workspace"}
                </span>
              </div>

              <div className="hero-actions">
                <Button href="/CreateListing" variant="primary">
                  New Listing
                </Button>
                <Button href="/OperatorBookings" variant="outline">
                  View Bookings
                </Button>
                <Button href="/OperatorMessages" variant="outline">
                  Open Inbox
                </Button>
              </div>
            </div>
          </section>

          <section className="stats-grid">
            <div className="glass-panel stat-card">
              <p className="stat-label">Live Listings</p>
              <p className="stat-value">{dashboard.liveListingsCount}</p>
              <p className="stat-copy">Listings currently in your workspace.</p>
            </div>

            <div className="glass-panel stat-card">
              <p className="stat-label">Pending Inquiries</p>
              <p className="stat-value">{dashboard.pendingInquiriesCount.toLocaleString()}</p>
              <p className="stat-copy">Manual responses waiting for review or follow-up.</p>
            </div>

            <div className="glass-panel stat-card">
              <p className="stat-label">Confirmed Trips</p>
              <p className="stat-value">{dashboard.confirmedTripsCount.toLocaleString()}</p>
              <p className="stat-copy">Trips already moved beyond inquiry state.</p>
            </div>

            <div className="glass-panel stat-card">
              <p className="stat-label">Estimated Revenue</p>
              <p className="stat-value">{revenueFormatter.format(dashboard.estimatedRevenue)}</p>
              <p className="stat-copy">Gross WiPay collections linked to confirmed trips.</p>
            </div>

            <div className="glass-panel stat-card">
              <p className="stat-label">Unread Messages</p>
              <p className="stat-value">{unreadMessages.toLocaleString()}</p>
              <p className="stat-copy">New operator replies and traveler updates waiting in the inbox.</p>
            </div>
          </section>

          <section className="content-grid">
            <div className="glass-panel panel">
              <div className="panel-head">
                <h3>Recent Inquiries</h3>
                <Button href="/OperatorBookings" variant="outline" className="btn-sm">
                  View all
                </Button>
              </div>

              <div className="list">
                {dashboard.recentInquiries.length ? (
                  dashboard.recentInquiries.map((inquiry) => (
                    <article key={inquiry.id} className="thread">
                      <div className="thread-thumb">
                        {inquiry.traveler_image_url || inquiry.listing_image_url ? (
                          <Image
                            fill
                            alt={inquiry.traveler_name}
                            sizes="68px"
                            unoptimized={
                              (inquiry.traveler_image_url ?? inquiry.listing_image_url ?? "").startsWith("data:")
                            }
                            src={inquiry.traveler_image_url ?? inquiry.listing_image_url ?? ""}
                          />
                        ) : null}
                      </div>

                      <div>
                        <h4 className="thread-title">
                          {inquiry.listing_title ?? inquiry.destination}
                        </h4>
                        <p className="thread-meta">
                          {inquiry.traveler_name}
                          {inquiry.traveler_email ? ` · ${inquiry.traveler_email}` : ""}
                          {" · "}
                          {inquiry.listing_location ?? inquiry.destination_country}
                          {" · "}
                          {formatRelativeTime(inquiry.created_at)}
                        </p>
                        <p className="thread-copy">
                          {inquiry.latest_message_preview
                            ? inquiry.latest_message_preview
                            : inquiry.notes
                              ? inquiry.notes
                              : `Availability: ${inquiry.availability}.`}
                        </p>
                        <div className="thread-actions">
                          <span className="thread-status status-pending">
                            Estimated {resolveWiPayInquiryAmount(inquiry) ? formatCurrency(Number(resolveWiPayInquiryAmount(inquiry))) : "Pending"}
                          </span>
                          <Button
                            href={inquiry.latest_conversation_id ? `/OperatorMessages?conversation=${inquiry.latest_conversation_id}` : "/OperatorMessages"}
                            variant="outline"
                            className="btn-sm"
                          >
                            Open messages
                          </Button>
                        </div>
                      </div>

                      <span className={`thread-status ${getStatusTone(inquiry.status)}`}>
                        {getStatusLabel(inquiry.status)}
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="thread-copy">
                    No inquiries were found for this operator yet. New inquiries will appear here
                    automatically.
                  </p>
                )}
              </div>
            </div>

          </section>

          <section className="payment-grid">
            <div className="glass-panel panel">
              <div className="panel-head">
                <h3>WiPay Collections</h3>
                <span className="stat-change">{dashboard.paymentCount.toLocaleString()} paid</span>
              </div>

              <div className="dashboard-filter-row tc-filter-tabs">
                {[
                  ["all", `All (${paymentCounts.all})`],
                  ["paid", `Paid (${paymentCounts.paid})`],
                  ["pending", `Pending (${paymentCounts.pending})`],
                  ["failed", `Failed (${paymentCounts.failed})`],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    href={buildDashboardHref(value as PaymentStatusFilter)}
                    variant="outline"
                    className={`btn-sm operator-filter-button tc-filter-pill ${selectedPaymentStatus === value ? "is-active tc-filter-pill-active" : ""}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="payment-list">
                {visiblePayments.length ? (
                  visiblePayments.map((payment) => {
                    const paymentAmount = new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: payment.currency === "USD" ? "USD" : "TTD",
                      maximumFractionDigits: 2,
                    }).format(Number.parseFloat(payment.amount));

                    return (
                      <div key={payment.id} className="payment-row">
                        <div>
                          <h4 className="payment-title">{payment.listing_title ?? "Travel payment"}</h4>
                          <p className="payment-meta">
                            {payment.traveler_name}
                            {payment.transaction_id ? ` · ${payment.transaction_id}` : ""}
                          </p>
                        </div>
                        <div className="payment-amount">
                          <strong>{paymentAmount}</strong>
                          <span className="payment-pill">{payment.status}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="thread-copy">No WiPay collections have been recorded yet.</p>
                )}
              </div>
            </div>

            <div className="glass-panel panel commission-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>Commission & withdrawal</p>
                  <h3>Operator payout balance</h3>
                </div>
                <span className="stat-change">Live</span>
              </div>

              <p className="commission-amount">{formatCurrency(operatorPayoutBalance)}</p>
              <p className="commission-note">
                This reflects the operator 80% payout share from successful WiPay collections. The remaining 20% is retained as the platform commission before withdrawal review.
              </p>

              <div className="dashboard-button-row">
                <form action="/api/operator/withdrawals/request" method="post">
                  <Button type="submit" variant="primary">
                    Request withdrawal
                  </Button>
                </form>
                <Button href="/OperatorSettings" variant="outline">
                  Update payout details
                </Button>
              </div>
            </div>

            <div className="glass-panel panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>Messages</p>
                  <h3>Recent operator conversations</h3>
                </div>
                <Button href="/OperatorMessages" variant="outline" className="btn-sm">
                  Open inbox
                </Button>
              </div>

              <div className="list">
                {recentConversations.length ? (
                  recentConversations.map((conversation) => (
                    <article key={conversation.id} className="thread">
                      <div className="thread-thumb">
                        {conversation.operator_image_url || conversation.traveler_image_url ? (
                          <Image
                            fill
                            alt={conversation.title}
                            sizes="68px"
                            unoptimized={
                              (conversation.operator_image_url ?? conversation.traveler_image_url ?? "").startsWith("data:")
                            }
                            src={conversation.operator_image_url ?? conversation.traveler_image_url ?? ""}
                          />
                        ) : null}
                      </div>

                      <div>
                        <h4 className="thread-title">{conversation.title}</h4>
                        <p className="thread-meta">
                          {conversation.subtitle}
                          {conversation.unread_count > 0 ? ` · ${conversation.unread_count} unread` : ""}
                        </p>
                        <p className="thread-copy">
                          {conversation.last_message_preview || "No messages yet in this thread."}
                        </p>
                        <div className="thread-actions">
                          <Button href={getConversationHref(conversation)} variant="outline" className="btn-sm">
                            Open thread
                          </Button>
                        </div>
                      </div>

                      <span className={`thread-status ${conversation.unread_count > 0 ? "status-new" : "status-pending"}`}>
                        {formatRelativeTime(conversation.last_message_at ?? conversation.updated_at)}
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="thread-copy">
                    No operator conversations are available yet. Traveler messages will appear here automatically.
                  </p>
                )}
              </div>
            </div>
          </section>

          <footer className="footer">
            <span>Copyright 2026 Tour ConnecTT. All Rights Reserved.</span>
            <div className="footer-links">
              <Link href="/LandingPage">Home</Link>
              <Link href="/PrivacyPolicy">Privacy Policy</Link>
              <Link href="/TermsOfService">Terms of Service</Link>
            </div>
          </footer>
        </div>
      </main>
    </PageShell>
  );
}
