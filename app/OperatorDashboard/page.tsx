import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PortalQuickLinks } from "@/components/admin/PortalQuickLinks";
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

      <main className="operator-page">
        <div className="wrap">
          <div style={{ marginBottom: 24 }}>
            <PortalQuickLinks variant="operator" />
          </div>
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
              <p className="stat-copy">Trips already moved beyond enquiry state.</p>
            </div>

            <div className="glass-panel stat-card">
              <p className="stat-label">Estimated Revenue</p>
              <p className="stat-value">{revenueFormatter.format(dashboard.estimatedRevenue)}</p>
              <p className="stat-copy">Gross WiPay collections linked to confirmed trips.</p>
            </div>

            <div className="glass-panel stat-card">
              <p className="stat-label">Unread Messages</p>
              <p className="stat-value">{unreadMessages.toLocaleString()}</p>
              <p className="stat-copy">New operator replies and traveller updates waiting in the inbox.</p>
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
                    className={`btn-filter btn-sm ${selectedPaymentStatus === value ? "is-active" : ""}`}
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
                  Operator settings
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
                    No operator conversations are available yet. Traveller messages will appear here automatically.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </PageShell>
  );
}
