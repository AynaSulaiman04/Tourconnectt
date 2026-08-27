import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { InquiryConfirmation } from "@/lib/supabase/inquiry-types";
import type { DirectMessagePageState } from "@/lib/supabase/direct-messages";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import type { TravelerCareProfile } from "@/lib/supabase/traveler-care";
import { resolveWiPayInquiryAmount } from "@/lib/payments/wipay";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { ProfileEditor } from "./profile-editor";

type TravelerDashboardViewProps = {
  profile: TravelerProfile;
  careProfile: TravelerCareProfile | null;
  defaultProfileImageUrl?: string | null;
  dashboard: {
    inquiries: InquiryConfirmation[];
    featuredListings: Array<{
      id: string;
      title: string;
      location: string;
      country: string;
      duration: string;
      summary: string;
      image_url: string | null;
      price: string | null;
      operator_id: string | null;
      operator_name: string;
      featured: boolean;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>;
    countries: string[];
    stats: {
      upcomingTrips: number;
      savedJourneys: number;
      inquiriesSent: number;
      countriesVisited: number;
    };
  };
  directMessageState: DirectMessagePageState;
  paymentStatus: string | null;
  paymentErrorMessage: string | null;
  activeTab: "overview" | "payments";
};

type DashboardFeedItem = {
  id: string;
  title: string;
  summary: string;
  href: string;
  timestamp: string;
  badge: string;
};

function getInquiryStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "reviewed":
      return "Under review";
    case "closed":
      return "Closed";
    case "rejected":
    case "unavailable":
      return "Unavailable";
    default:
      return "Submitted";
  }
}

function getInquiryNextStep(status: string | null | undefined) {
  switch (status) {
    case "reviewed":
      return "The operator has started reviewing this enquiry.";
    case "confirmed":
      return "The enquiry is confirmed and ready for final arrangements.";
    case "closed":
      return "This enquiry is closed, but the thread stays available.";
    case "rejected":
    case "unavailable":
      return "The listing is unavailable for this request.";
    default:
      return "Waiting for the operator to review your request.";
  }
}

function getPaymentStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "paid":
    case "completed":
    case "success":
      return "Paid";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "error":
      return "Error";
    case "refunded":
      return "Refunded";
    case "initiated":
    case "pending":
      return "Pending";
    default:
      return "Not started";
  }
}

function formatPaymentAmount(value: string | number | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(value.replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "TTD",
    maximumFractionDigits: 2,
  }).format(parsed);
}

function buildTabHref(tab: "overview" | "payments") {
  const params = new URLSearchParams();
  if (tab !== "overview") {
    params.set("tab", tab);
  }

  const query = params.toString();
  return query ? `/TravellerProfile?${query}` : "/TravellerProfile";
}

function buildFeedItems(
  inquiries: InquiryConfirmation[],
  conversations: DirectMessagePageState["conversations"],
): DashboardFeedItem[] {
  const inquiryItems = inquiries.slice(0, 4).map((inquiry) => {
    const listingTitle = inquiry.listing?.title ?? inquiry.destination;
    const paymentStatus = inquiry.payment?.status ? getPaymentStatusLabel(inquiry.payment.status) : null;
    const paymentAmount = resolveWiPayInquiryAmount(inquiry);

    return {
      id: `inquiry-${inquiry.id}`,
      title: listingTitle,
      summary:
        inquiry.status === "confirmed"
          ? "Your enquiry is confirmed and ready for the next step."
          : inquiry.notes || getInquiryNextStep(inquiry.status),
      href: `/ConfirmationPage?inquiryId=${inquiry.id}`,
      timestamp: inquiry.updated_at,
      badge: paymentStatus ? `${getInquiryStatusLabel(inquiry.status)} · ${paymentStatus}` : getInquiryStatusLabel(inquiry.status),
      amount: paymentAmount,
    } satisfies DashboardFeedItem & { amount: string | null };
  });

  const messageItems = conversations.slice(0, 4).map((conversation) => ({
    id: `conversation-${conversation.id}`,
    title: conversation.title,
    summary: conversation.last_message_preview
      ? conversation.last_message_preview
      : "No messages yet in this thread.",
    href: conversation.launch_href ?? "/Messages",
    timestamp: conversation.last_message_at ?? conversation.updated_at,
    badge: conversation.unread_count > 0 ? `${conversation.unread_count} unread` : "Message thread",
  }));

  return [...inquiryItems, ...messageItems]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 6)
    .map(({ id, title, summary, href, timestamp, badge }) => ({
      id,
      title,
      summary,
      href,
      timestamp,
      badge,
    }));
}

function getBookingLabel(inquiry: InquiryConfirmation) {
  if (["paid", "completed", "success"].includes(inquiry.payment?.status ?? "")) {
    return "Booked";
  }

  if (inquiry.status === "confirmed" && resolveWiPayInquiryAmount(inquiry)) {
    return "WiPay ready";
  }

  if (inquiry.status === "confirmed") {
    return "Awaiting quote";
  }

  return getInquiryStatusLabel(inquiry.status);
}

function getBookingCta(inquiry: InquiryConfirmation) {
  const paymentAmount = resolveWiPayInquiryAmount(inquiry);

  if (inquiry.payment?.checkout_url && ["pending", "initiated"].includes(inquiry.payment.status)) {
    return (
      <Button href={inquiry.payment.checkout_url} variant="primary" className="btn-sm" rel="noreferrer" target="_blank">
        Continue WiPay
      </Button>
    );
  }

  if (
    inquiry.status === "confirmed" &&
    paymentAmount &&
    inquiry.payment?.status !== "paid" &&
    inquiry.payment?.status !== "completed" &&
    inquiry.payment?.status !== "success" &&
    inquiry.payment?.status !== "initiated" &&
    inquiry.payment?.status !== "pending"
  ) {
    return (
      <form action="/api/payments/wipay/start" method="post">
        <input name="inquiry_id" type="hidden" value={inquiry.id} />
        <Button type="submit" variant="primary" className="btn-sm">
          Pay with WiPay
        </Button>
      </form>
    );
  }

  if (["paid", "completed", "success"].includes(inquiry.payment?.status ?? "")) {
    return (
      <span className="dashboard-status-pill dashboard-status-pill-success">
        Payment received
      </span>
    );
  }

  return (
    <Button href={`/ConfirmationPage?inquiryId=${inquiry.id}`} variant="outline" className="btn-sm">
      Open enquiry
    </Button>
  );
}

export function TravellerDashboardView({
  profile,
  careProfile,
  defaultProfileImageUrl,
  dashboard,
  directMessageState,
  paymentStatus,
  paymentErrorMessage,
  activeTab,
}: TravelerDashboardViewProps) {
  const displayName = profile.full_name;
  const unreadMessages = directMessageState.conversations.reduce((total, conversation) => total + conversation.unread_count, 0);
  const confirmedBookings = dashboard.inquiries.filter((inquiry) =>
    inquiry.status === "confirmed" ||
    ["pending", "initiated", "paid", "completed", "success"].includes(inquiry.payment?.status ?? ""),
  );
  const feedItems = buildFeedItems(dashboard.inquiries, directMessageState.conversations);
  const heroStats: Array<{ value: ReactNode; label: string }> = [
    { value: dashboard.stats.inquiriesSent, label: "Enquiries Sent" },
    { value: confirmedBookings.length, label: "Bookings & Payments" },
    { value: unreadMessages, label: "Unread Messages" },
  ];

  return (
    <main className={`traveler-dashboard traveler-dashboard--${activeTab}`}>

      {paymentErrorMessage ? (
        <div className="dashboard-panel dashboard-section" role="alert">
          <p className="dashboard-eyebrow">Payment update</p>
          <h2 className="dashboard-section-title">WiPay needs attention</h2>
          <p className="dashboard-section-copy">{paymentErrorMessage}</p>
        </div>
      ) : paymentStatus ? (
        <div className="dashboard-panel dashboard-section" role="status">
          <p className="dashboard-eyebrow">Payment update</p>
          <h2 className="dashboard-section-title">WiPay status: {paymentStatus}</h2>
          <p className="dashboard-section-copy">
            Your payment flow is still connected to the enquiry and booking timeline.
          </p>
        </div>
      ) : null}

      <section className="dashboard-panel dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="dashboard-eyebrow">Traveller dashboard</p>
          <h1 className="dashboard-title">{displayName}</h1>
          <p className="dashboard-copy">
            A single place for your enquiries, bookings, WiPay payments, and operator messages. Updates here reflect
            your latest travel activity.
          </p>

          <div className="dashboard-actions">
            <Button href="/Enquiry" variant="primary">
              New enquiry
            </Button>
            <Button href="/Messages" variant="outline">
              Open Messages
            </Button>
            <Button href="#requested-inquiries" variant="ghost">
              View Dashboard
            </Button>
          </div>

        </div>

        <div className="dashboard-summary-strip" aria-label="Traveller summary">
          {heroStats.map((item) => (
            <article className="dashboard-summary-item" key={item.label}>
              <p className="dashboard-summary-value">{item.value}</p>
              <p className="dashboard-summary-label">{item.label}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-tabbar tc-filter-tabs" role="tablist" aria-label="Traveller dashboard views">
        <Button
          href={buildTabHref("overview")}
          variant="outline"
          className={`btn-sm dashboard-tab tc-filter-pill ${activeTab === "overview" ? "dashboard-tab-active tc-filter-pill-active" : ""}`}
        >
          Overview
        </Button>
        <Button
          href={buildTabHref("payments")}
          variant="outline"
          className={`btn-sm dashboard-tab tc-filter-pill ${activeTab === "payments" ? "dashboard-tab-active tc-filter-pill-active" : ""}`}
        >
          Payments
        </Button>
      </div>

      <section className="dashboard-panel dashboard-section dashboard-profile-card" id="profile-settings">
        <div className="dashboard-section-head">
          <div className="dashboard-profile-copy">
            <p className="dashboard-eyebrow">Traveller profile</p>
            <h2 className="dashboard-section-title">Profile details and photo</h2>
            <p className="dashboard-section-copy">
              Add a profile picture so your navbar and inbox feel personalised across the traveller portal.
            </p>
          </div>
        </div>

        <ProfileEditor careProfile={careProfile} defaultProfileImageUrl={defaultProfileImageUrl} profile={profile} />
      </section>

      <section className="dashboard-layout">
        <div className="dashboard-columns">
          <article className="dashboard-panel dashboard-section" id="requested-inquiries">
            <div className="dashboard-section-head">
              <div>
                <p className="dashboard-eyebrow">Requested enquiries</p>
                <h2 className="dashboard-section-title">Your recent requests</h2>
                <p className="dashboard-section-copy">
                  Track every enquiry from submission through operator response.
                </p>
              </div>

              <Button href="/Enquiry" variant="outline" className="btn-sm">
                Send another enquiry
              </Button>
            </div>

            <div className="dashboard-list">
              {dashboard.inquiries.length ? (
                dashboard.inquiries.slice(0, 4).map((inquiry) => {
                  const listingTitle = inquiry.listing?.title ?? inquiry.destination;
                  const operatorName = inquiry.operator_name || "Tour ConnecTT";
                  const inquiryChannel = inquiry.operator_email && inquiry.operator_phone
                    ? "WhatsApp + Email"
                    : inquiry.operator_phone
                      ? "WhatsApp"
                      : inquiry.operator_email
                        ? "Email"
                        : "Operator details missing";
                  const paymentAmount = formatPaymentAmount(resolveWiPayInquiryAmount(inquiry));

                  return (
                    <article className="dashboard-card" key={inquiry.id}>
                      <div className="dashboard-card-top">
                        <div>
                          <p className="dashboard-eyebrow" style={{ marginBottom: "0.35rem" }}>
                            Enquiry {inquiry.id.slice(0, 6).toUpperCase()}
                          </p>
                          <h3 className="dashboard-card-title">{listingTitle}</h3>
                        </div>
                        <span className="dashboard-pill">{getInquiryStatusLabel(inquiry.status)}</span>
                      </div>

                      <p className="dashboard-meta">
                        {operatorName} · {formatDate(inquiry.created_at)} · {inquiryChannel}
                      </p>

                      <p className="dashboard-copy-small">
                        {inquiry.notes || getInquiryNextStep(inquiry.status)}
                      </p>

                      <div className="dashboard-pills">
                        <span className="dashboard-pill">{formatDate(inquiry.preferred_start_date)} - {formatDate(inquiry.preferred_end_date)}</span>
                        <span className="dashboard-pill">{inquiry.availability}</span>
                        {paymentAmount ? <span className="dashboard-pill dashboard-pill-success">{paymentAmount}</span> : null}
                      </div>

                      <div className="dashboard-section-card-footer">
                        <Button href={`/ConfirmationPage?inquiryId=${inquiry.id}`} variant="outline" className="btn-sm">
                          Open enquiry
                        </Button>
                        <Button href={`/Messages?inquiry=${inquiry.id}`} variant="ghost" className="btn-sm">
                          Message operator
                        </Button>
                        {inquiry.status === "confirmed" || inquiry.payment ? getBookingCta(inquiry) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="dashboard-empty">
                  <strong>No enquiries yet</strong>
                  <p>Start a new enquiry and it will appear here with live status updates.</p>
                </div>
              )}
            </div>
          </article>

          <article className="dashboard-panel dashboard-section" id="bookings">
            <div className="dashboard-section-head">
              <div>
                <p className="dashboard-eyebrow">Bookings & WiPay</p>
                <h2 className="dashboard-section-title">Confirmed trips and payment actions</h2>
                <p className="dashboard-section-copy">
                  Confirmed trips appear here with the right WiPay action for the current status.
                </p>
              </div>
            </div>

            <div className="dashboard-list">
              {confirmedBookings.length ? (
                confirmedBookings.slice(0, 4).map((inquiry) => {
                  const listingTitle = inquiry.listing?.title ?? inquiry.destination;
                  const paymentAmount = formatPaymentAmount(resolveWiPayInquiryAmount(inquiry));

                  return (
                    <article className="dashboard-card" key={inquiry.id}>
                      <div className="dashboard-card-top">
                        <div>
                          <p className="dashboard-eyebrow" style={{ marginBottom: "0.35rem" }}>
                            Booking
                          </p>
                          <h3 className="dashboard-card-title">{listingTitle}</h3>
                        </div>
                        <span className="dashboard-pill dashboard-pill-success">
                          {getBookingLabel(inquiry)}
                        </span>
                      </div>

                      <p className="dashboard-meta">
                        {formatDate(inquiry.preferred_start_date)} to {formatDate(inquiry.preferred_end_date)} ·{" "}
                        {inquiry.operator_name || "Tour ConnecTT"}
                      </p>

                      <div className="dashboard-payment-row">
                        {paymentAmount ? <p className="dashboard-payment-amount">{paymentAmount}</p> : null}
                        <span className="dashboard-pay-chip">{getPaymentStatusLabel(inquiry.payment?.status)}</span>
                      </div>

                      <p className="dashboard-copy-small">
                        {inquiry.payment?.status === "paid" ||
                        inquiry.payment?.status === "completed" ||
                        inquiry.payment?.status === "success"
                          ? "WiPay payment has been confirmed."
                          : inquiry.status === "confirmed" && paymentAmount
                            ? "This trip is ready for WiPay checkout."
                            : "Keep an eye on this booking for payment changes."}
                      </p>

                      <div className="dashboard-section-card-footer">
                        <Button href={`/ConfirmationPage?inquiryId=${inquiry.id}`} variant="outline" className="btn-sm">
                          Booking details
                        </Button>
                        {getBookingCta(inquiry)}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="dashboard-empty">
                  <strong>No confirmed bookings yet</strong>
                  <p>Once an operator confirms an enquiry, the booking and WiPay actions will appear here.</p>
                </div>
              )}
            </div>
          </article>

          <article className="dashboard-panel dashboard-section" id="messages">
            <div className="dashboard-section-head">
              <div>
                <p className="dashboard-eyebrow">Messages</p>
                <h2 className="dashboard-section-title">Conversation threads with operators</h2>
                <p className="dashboard-section-copy">
                  The latest replies from different operators appear here with unread counts.
                </p>
              </div>

              <Button href="/Messages" variant="outline" className="btn-sm">
                Open inbox
              </Button>
            </div>

            <div className="dashboard-message-grid">
              {directMessageState.conversations.length ? (
                [...directMessageState.conversations]
                  .sort(
                    (left, right) =>
                      new Date((right.last_message_at ?? right.updated_at)).getTime() -
                      new Date((left.last_message_at ?? left.updated_at)).getTime(),
                  )
                  .slice(0, 4)
                  .map((conversation) => (
                    <article className="dashboard-card" key={conversation.id}>
                      <div className="dashboard-card-top">
                        <div>
                          <p className="dashboard-eyebrow" style={{ marginBottom: "0.35rem" }}>
                            {conversation.unread_count > 0 ? `${conversation.unread_count} unread` : "Conversation"}
                          </p>
                          <h3 className="dashboard-card-title">{conversation.title}</h3>
                        </div>
                        <span className="dashboard-pill">{conversation.inquiry_status ?? "Direct chat"}</span>
                      </div>

                      <p className="dashboard-meta">{conversation.subtitle}</p>
                      <p className="dashboard-copy-small">
                        {conversation.last_message_preview || "No messages yet in this thread."}
                      </p>

                      <div className="dashboard-section-card-footer">
                        <Button href={conversation.launch_href ?? `/Messages?conversation=${conversation.id}`} variant="primary" className="btn-sm">
                          Open thread
                        </Button>
                      </div>
                    </article>
                  ))
              ) : (
                <div className="dashboard-empty">
                  <strong>No messages yet</strong>
                  <p>When operators reply, their conversations will appear here automatically.</p>
                </div>
              )}
            </div>
          </article>

          <article className="dashboard-panel dashboard-section" id="updates">
            <div className="dashboard-section-head">
              <div>
                <p className="dashboard-eyebrow">Live updates</p>
                <h2 className="dashboard-section-title">Recent changes and activity</h2>
                <p className="dashboard-section-copy">
                  A compact feed of enquiry status changes, payment updates, and new messages.
                </p>
              </div>
            </div>

            <div className="dashboard-feed">
              {feedItems.length ? (
                feedItems.map((item) => (
                  <Link key={item.id} className="dashboard-feed-item" href={item.href}>
                    <div className="dashboard-feed-top">
                      <h4>{item.title}</h4>
                      <span className="dashboard-feed-time">{formatDateTime(item.timestamp)}</span>
                    </div>
                    <p>{item.summary}</p>
                    <span className="dashboard-pill" style={{ width: "fit-content" }}>
                      {item.badge}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="dashboard-empty">
                  <strong>No recent activity</strong>
                  <p>As your enquiries move forward, updates will appear here in real time.</p>
                </div>
              )}
            </div>
          </article>
        </div>

      </section>
    </main>
  );
}
