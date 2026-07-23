import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { InquiryConfirmation } from "@/lib/supabase/inquiry-types";
import type { DirectMessagePageState } from "@/lib/supabase/direct-messages";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import type { TravelerCareProfile } from "@/lib/supabase/traveler-care";
import { resolveWiPayInquiryAmount } from "@/lib/payments/wipay";
import { ProfileEditor } from "./profile-editor";

type TravelerDashboardViewProps = {
  profile: TravelerProfile;
  careProfile: TravelerCareProfile | null;
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
      return "The operator has started reviewing this inquiry.";
    case "confirmed":
      return "The inquiry is confirmed and ready for final arrangements.";
    case "closed":
      return "This inquiry is closed, but the thread stays available.";
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

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

  return new Intl.NumberFormat("en-US", {
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
          ? "Your inquiry is confirmed and ready for the next step."
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
      Open inquiry
    </Button>
  );
}

export function TravellerDashboardView({
  profile,
  careProfile,
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
    { value: dashboard.stats.inquiriesSent, label: "Inquiries Sent" },
    { value: confirmedBookings.length, label: "Bookings & Payments" },
    { value: unreadMessages, label: "Unread Messages" },
  ];

  return (
    <main className={`traveler-dashboard traveler-dashboard--${activeTab}`}>
      <style>{`
        .traveler-dashboard {
          max-width: 1480px;
          margin: 0 auto;
          padding: 4rem 5rem 6rem;
          display: grid;
          gap: 1.5rem;
        }

        .dashboard-panel {
          border: 1px solid rgba(55, 45, 38, 0.08);
          border-radius: var(--radius-panel);
          background: rgba(252, 249, 248, 0.82);
          box-shadow: var(--shadow-glass);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        .dashboard-hero {
          display: grid;
          gap: 1rem;
          padding: 1.6rem;
        }

        .dashboard-hero-copy {
          display: grid;
          gap: 1rem;
          align-content: center;
          padding: 0.5rem 0.5rem 0.5rem 0.2rem;
        }

        .dashboard-eyebrow {
          margin: 0;
          color: var(--secondary);
          font-size: 0.75rem;
          line-height: 1.4;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .dashboard-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(3rem, 5vw, 5.5rem);
          line-height: 0.95;
          letter-spacing: -0.04em;
          font-weight: 300;
          color: var(--on-surface);
        }

        .dashboard-copy {
          margin: 0;
          max-width: 50rem;
          color: var(--on-surface-variant);
          font-size: 1rem;
          line-height: 1.7;
          font-weight: 300;
        }

        .dashboard-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          justify-content: center;
          align-items: center;
        }

        .dashboard-tabbar {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-top: 0.25rem;
          padding: 0.85rem;
          border: 1px solid rgba(17, 19, 24, 0.12);
          border-radius: 1.5rem;
          background: rgba(255, 253, 248, 0.92);
          box-shadow: 0 16px 42px rgba(53, 39, 33, 0.08);
          width: fit-content;
        }

        .dashboard-tab {
          min-height: 2.5rem;
          padding-inline: 0.95rem;
          border-color: rgba(197, 22, 29, 0.28);
          background: rgba(255, 253, 248, 0.92);
          color: var(--secondary);
          box-shadow: none;
        }

        .dashboard-tab-active {
          background: linear-gradient(135deg, var(--tc-red), var(--tc-red-dark));
          color: #fff;
          border-color: rgba(197, 22, 29, 0.34);
          box-shadow: 0 12px 26px rgba(197, 22, 29, 0.18);
        }

        .dashboard-tabbar {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          padding: 0.85rem;
          border-radius: 1.5rem;
          border: 1px solid rgba(17, 19, 24, 0.12);
          background: rgba(255, 253, 248, 0.92);
          width: fit-content;
          box-shadow: 0 16px 42px rgba(53, 39, 33, 0.08);
        }

        .dashboard-tab {
          min-height: 2.5rem;
          padding-inline: 0.95rem;
          border-color: rgba(197, 22, 29, 0.28);
          background: rgba(255, 253, 248, 0.92);
          color: var(--secondary);
          box-shadow: none;
        }

        .dashboard-tab-active {
          background: linear-gradient(135deg, var(--tc-red), var(--tc-red-dark));
          color: #fff;
          border-color: rgba(197, 22, 29, 0.34);
          box-shadow: 0 12px 26px rgba(197, 22, 29, 0.18);
        }

        .dashboard-summary-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.85rem;
        }

        .dashboard-summary-item {
          display: grid;
          gap: 0.45rem;
          padding: 1rem 1.05rem;
          border: 1px solid rgba(206, 197, 185, 0.25);
          border-radius: 1.15rem;
          background: rgba(255, 253, 251, 0.86);
          min-height: 6.5rem;
        }

        .dashboard-summary-value {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(1.85rem, 3vw, 3.2rem);
          line-height: 1;
          letter-spacing: -0.04em;
          font-weight: 300;
          color: var(--on-surface);
        }

        .dashboard-summary-label {
          margin: 0;
          color: var(--secondary);
          font-size: 0.68rem;
          line-height: 1.4;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .dashboard-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 1.5rem;
          align-items: start;
        }

        .dashboard-columns {
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(320px, 0.88fr);
          gap: 1.5rem;
          align-items: start;
        }

        .dashboard-columns > article {
          display: grid;
          gap: 1.5rem;
          align-self: start;
        }

        .dashboard-section {
          padding: 1.5rem;
        }

        .dashboard-section-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .dashboard-section-head .btn-sm {
          justify-content: center;
          text-align: center;
        }

        .dashboard-section-title {
          margin: 0.25rem 0 0;
          font-family: var(--font-display);
          font-size: clamp(1.7rem, 3vw, 2.9rem);
          line-height: 1.02;
          letter-spacing: -0.04em;
          font-weight: 300;
          color: var(--on-surface);
        }

        .dashboard-section-copy {
          margin: 0.55rem 0 0;
          color: var(--on-surface-variant);
          font-size: 0.95rem;
          line-height: 1.65;
          font-weight: 300;
        }

        .dashboard-inline-link {
          color: var(--secondary);
          font-size: 0.68rem;
          line-height: 1.4;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .dashboard-list {
          display: grid;
          gap: 0.85rem;
          max-height: 31rem;
          overflow-y: auto;
          padding-right: 0.35rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(197, 22, 29, 0.32) rgba(17, 19, 24, 0.06);
        }

        .dashboard-card {
          display: grid;
          gap: 0.75rem;
          padding: 1rem 1.05rem;
          border: 1px solid rgba(206, 197, 185, 0.25);
          border-radius: 1.1rem;
          background: rgba(255, 253, 251, 0.86);
        }

        .dashboard-card-top {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .dashboard-card-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.55rem;
          line-height: 1.06;
          letter-spacing: -0.04em;
          font-weight: 300;
          color: var(--on-surface);
        }

        .dashboard-meta,
        .dashboard-copy-small {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 0.9rem;
          line-height: 1.6;
          font-weight: 300;
        }

        .dashboard-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .dashboard-pill {
          display: inline-flex;
          align-items: center;
          min-height: 2.2rem;
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          border: 1px solid rgba(206, 197, 185, 0.24);
          background: rgba(248, 244, 239, 0.72);
          color: var(--on-surface-variant);
          font-size: 0.66rem;
          line-height: 1;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .dashboard-pill-success {
          border-color: rgba(111, 98, 73, 0.2);
          background: rgba(111, 98, 73, 0.08);
          color: var(--primary);
        }

        .dashboard-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
          justify-content: center;
          align-items: center;
        }

        .dashboard-hero-figure {
          display: grid;
          gap: 0.85rem;
          align-content: start;
          padding: 0.25rem;
        }

        .dashboard-avatar {
          width: 6rem;
          height: 6rem;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 1px solid rgba(206, 197, 185, 0.4);
          background: linear-gradient(180deg, rgba(111, 98, 73, 0.14), rgba(167, 67, 31, 0.08));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
        }

        .dashboard-avatar span {
          font-family: var(--font-display);
          font-size: 2rem;
          line-height: 1;
          font-weight: 300;
          letter-spacing: -0.04em;
        }

        .dashboard-avatar-image {
          object-fit: cover;
        }

        .dashboard-side {
          display: grid;
          gap: 1.5rem;
        }

        .dashboard-empty {
          padding: 1rem 1.05rem;
          border: 1px dashed rgba(206, 197, 185, 0.26);
          border-radius: 1rem;
          background: rgba(255, 253, 251, 0.68);
          color: var(--on-surface-variant);
        }

        .dashboard-empty strong {
          display: block;
          margin-bottom: 0.4rem;
          color: var(--on-surface);
          font-weight: 600;
        }

        .dashboard-feed {
          display: grid;
          gap: 0.85rem;
          max-height: 24rem;
          overflow-y: auto;
          padding-right: 0.35rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(197, 22, 29, 0.32) rgba(17, 19, 24, 0.06);
        }

        .dashboard-feed-item {
          display: grid;
          gap: 0.4rem;
          padding: 0.95rem 1rem;
          border: 1px solid rgba(206, 197, 185, 0.24);
          border-radius: 1rem;
          background: rgba(255, 253, 251, 0.84);
        }

        .dashboard-feed-item h4 {
          margin: 0;
          font-size: 1rem;
          line-height: 1.3;
          font-weight: 600;
          color: var(--on-surface);
        }

        .dashboard-feed-item p {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 0.88rem;
          line-height: 1.55;
        }

        .dashboard-feed-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .dashboard-feed-time {
          color: var(--secondary);
          font-size: 0.65rem;
          line-height: 1.4;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-weight: 700;
          white-space: nowrap;
        }

        .dashboard-columns {
          display: grid;
          gap: 1.5rem;
        }

        .dashboard-inquiry-grid,
        .dashboard-booking-grid,
        .dashboard-message-grid {
          display: grid;
          gap: 0.85rem;
        }

        .dashboard-message-grid {
          max-height: 31rem;
          overflow-y: auto;
          padding-right: 0.35rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(197, 22, 29, 0.32) rgba(17, 19, 24, 0.06);
        }

        .dashboard-section-card {
          display: grid;
          gap: 0.75rem;
          padding: 1rem 1.05rem;
          border: 1px solid rgba(206, 197, 185, 0.25);
          border-radius: 1rem;
          background: rgba(255, 253, 251, 0.84);
        }

        .dashboard-section-card h4 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.45rem;
          line-height: 1.08;
          font-weight: 300;
          letter-spacing: -0.04em;
        }

        .dashboard-section-card-footer {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
          justify-content: center;
          align-items: center;
        }

        .dashboard-subtle {
          color: var(--on-surface-variant);
          font-size: 0.85rem;
          line-height: 1.5;
          margin: 0;
        }

        .dashboard-pay-chip {
          display: inline-flex;
          align-items: center;
          font-family: var(--font-display);
          min-height: 2rem;
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          border: 1px solid rgba(167, 67, 31, 0.16);
          background: rgba(243, 222, 214, 0.48);
          color: var(--secondary);
          font-size: 0.66rem;
          line-height: 1;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-weight: 700;
          width: fit-content;
        }

        .dashboard-pay-chip.success {
          border-color: rgba(111, 98, 73, 0.18);
          background: rgba(111, 98, 73, 0.08);
          color: var(--primary);
        }

        .dashboard-status-pill {
          display: inline-flex;
          align-items: center;
          min-height: 2rem;
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          border: 1px solid rgba(167, 67, 31, 0.16);
          background: rgba(243, 222, 214, 0.48);
          color: var(--secondary);
          font-family: var(--font-display);
          font-size: 0.72rem;
          line-height: 1;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 300;
        }

        .dashboard-status-pill-success {
          border-color: rgba(111, 98, 73, 0.18);
          background: rgba(111, 98, 73, 0.08);
          color: var(--primary);
        }

        .dashboard-payment-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          align-items: center;
        }

        .dashboard-profile-card {
          display: grid;
          gap: 1rem;
        }

        .dashboard-profile-copy {
          display: grid;
          gap: 0.45rem;
        }

        .profile-editor {
          display: grid;
          gap: 1rem;
        }

        .profile-photo-field {
          display: grid;
          gap: 0.7rem;
        }

        .profile-photo-preview {
          position: relative;
          width: 6.5rem;
          height: 6.5rem;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid rgba(197, 22, 29, 0.14);
          background: rgba(243, 222, 214, 0.42);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 14px 28px rgba(53, 39, 33, 0.08);
        }

        .profile-photo-image {
          display: block;
        }

        .profile-photo-placeholder {
          color: var(--secondary);
          font-size: 1.5rem;
        }

        .profile-photo-camera {
          position: absolute;
          right: 0.2rem;
          bottom: 0.2rem;
          width: 2rem;
          height: 2rem;
          border: 1px solid rgba(197, 22, 29, 0.18);
          border-radius: 999px;
          background: rgba(255, 253, 248, 0.98);
          color: var(--secondary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .profile-photo-field input[type="file"] {
          display: none;
        }

        .profile-photo-help,
        .profile-editor-value,
        .form-status {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 0.88rem;
          line-height: 1.55;
        }

        .profile-editor .field {
          display: grid;
          gap: 0.45rem;
        }

        .profile-editor label,
        .profile-editor-label {
          color: var(--secondary);
          font-size: 0.7rem;
          line-height: 1.2;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .profile-editor input[type="text"],
        .profile-editor input[type="tel"],
        .profile-editor textarea,
        .profile-editor select {
          min-height: 3rem;
          border-radius: 18px;
          border: 1px solid rgba(17, 19, 24, 0.08);
          background: rgba(255, 253, 248, 0.96);
          padding: 0 1rem;
          color: var(--on-surface);
          font: inherit;
        }

        .profile-editor textarea {
          min-height: 6.5rem;
          resize: vertical;
        }

        .profile-editor input[type="text"]:focus,
        .profile-editor input[type="tel"]:focus,
        .profile-editor textarea:focus,
        .profile-editor select:focus {
          outline: none;
          border-color: rgba(197, 22, 29, 0.22);
          box-shadow: 0 0 0 4px rgba(197, 22, 29, 0.08);
        }

        .profile-care-section {
          display: grid;
          gap: 1rem;
          margin-top: 0.5rem;
          padding: 1.15rem;
          border: 1px solid rgba(17, 19, 24, 0.08);
          border-radius: 22px;
          background: rgba(248, 245, 241, 0.66);
        }

        .profile-care-section h3 {
          margin: 0.35rem 0;
          font-family: var(--font-display);
          font-size: 1.45rem;
          font-weight: 400;
        }

        .profile-care-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .profile-editor-meta {
          display: grid;
          gap: 0.75rem;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .profile-editor-alert {
          display: flex;
          gap: 0.75rem;
          align-items: flex-start;
          padding: 0.85rem 0.9rem;
          border-radius: 1rem;
          border: 1px solid rgba(197, 22, 29, 0.16);
          background: rgba(243, 222, 214, 0.38);
          color: var(--secondary);
        }

        .profile-editor-alert p,
        .profile-editor-alert strong,
        .field-error {
          margin: 0;
        }

        .submit-wrap {
          display: grid;
          gap: 0.75rem;
        }

        .dashboard-payment-amount {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.35rem;
          line-height: 1.06;
          font-weight: 300;
          color: var(--on-surface);
        }

        .payment-filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .payment-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem;
        }

        .payment-summary-card {
          display: grid;
          gap: 0.35rem;
          padding: 1rem;
          border: 1px solid rgba(206, 197, 185, 0.25);
          border-radius: 1rem;
          background: rgba(255, 253, 251, 0.86);
        }

        .payment-summary-card strong {
          font-family: var(--font-display);
          font-size: 1.8rem;
          line-height: 1;
          font-weight: 300;
          color: var(--on-surface);
        }

        .payment-summary-card span {
          color: var(--on-surface-variant);
          font-size: 0.85rem;
          line-height: 1.45;
        }

        .traveler-dashboard--payments #requested-inquiries,
        .traveler-dashboard--payments #messages {
          display: none;
        }

        .traveler-dashboard--payments #bookings,
        .traveler-dashboard--payments #updates {
          display: grid;
        }

        @media (max-width: 1100px) {
          .traveler-dashboard {
            padding: 3rem 1.5rem 4.5rem;
          }

          .dashboard-layout {
            grid-template-columns: 1fr;
          }

          .dashboard-columns {
            grid-template-columns: 1fr;
          }

          .payment-summary-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .dashboard-section {
            padding: 1.1rem;
          }

          .dashboard-section-head {
            align-items: flex-start;
            flex-direction: column;
          }

          .profile-editor-meta {
            grid-template-columns: 1fr;
          }

          .profile-care-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

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
            Your payment flow is still connected to the inquiry and booking timeline.
          </p>
        </div>
      ) : null}

      <section className="dashboard-panel dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="dashboard-eyebrow">Traveler dashboard</p>
          <h1 className="dashboard-title">{displayName}</h1>
          <p className="dashboard-copy">
            A single place for your inquiries, bookings, WiPay payments, and operator messages. Updates here reflect
            your latest travel activity.
          </p>

          <div className="dashboard-actions">
            <Button href="/Inquiry" variant="primary">
              New Inquiry
            </Button>
            <Button href="/Messages" variant="outline">
              Open Messages
            </Button>
            <Button href="#requested-inquiries" variant="ghost">
              View Dashboard
            </Button>
          </div>

        </div>

        <div className="dashboard-summary-strip" aria-label="Traveler summary">
          {heroStats.map((item) => (
            <article className="dashboard-summary-item" key={item.label}>
              <p className="dashboard-summary-value">{item.value}</p>
              <p className="dashboard-summary-label">{item.label}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-tabbar tc-filter-tabs" role="tablist" aria-label="Traveler dashboard views">
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
            <p className="dashboard-eyebrow">Traveler profile</p>
            <h2 className="dashboard-section-title">Profile details and photo</h2>
            <p className="dashboard-section-copy">
              Add a profile picture so your navbar and inbox feel personalized across the traveler portal.
            </p>
          </div>
        </div>

        <ProfileEditor profile={profile} careProfile={careProfile} />
      </section>

      <section className="dashboard-layout">
        <div className="dashboard-columns">
          <article className="dashboard-panel dashboard-section" id="requested-inquiries">
            <div className="dashboard-section-head">
              <div>
                <p className="dashboard-eyebrow">Requested inquiries</p>
                <h2 className="dashboard-section-title">Your recent requests</h2>
                <p className="dashboard-section-copy">
                  Track every inquiry from submission through operator response.
                </p>
              </div>

              <Button href="/Inquiry" variant="outline" className="btn-sm">
                Send another inquiry
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
                            Inquiry {inquiry.id.slice(0, 6).toUpperCase()}
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
                          Open inquiry
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
                  <strong>No inquiries yet</strong>
                  <p>Start a new inquiry and it will appear here with live status updates.</p>
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
                  <p>Once an operator confirms an inquiry, the booking and WiPay actions will appear here.</p>
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
                  A compact feed of inquiry status changes, payment updates, and new messages.
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
                  <p>As your inquiries move forward, updates will appear here in real time.</p>
                </div>
              )}
            </div>
          </article>
        </div>

      </section>
    </main>
  );
}
