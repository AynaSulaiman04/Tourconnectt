import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { getDirectMessagePageState } from "@/lib/supabase/direct-messages";
import { getInquiryConfirmation } from "@/lib/supabase/inquiry";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { ReviewForm } from "./review-form";
import { initialReviewFormState, type ReviewFormState } from "./actions";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { submitTravelerReview } from "@/lib/supabase/reviews";
import { resolveWiPayInquiryAmount } from "@/lib/payments/wipay";
import { formatDate, formatDateTime } from "@/lib/format/date";

type ConfirmationPageProps = {
  searchParams: Promise<{
    inquiry?: string;
    inquiryId?: string;
    review?: string;
    payment?: string;
    payment_error?: string;
    order_id?: string;
  }>;
};

function getInquiryStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "reviewed":
      return "Under review";
    case "confirmed":
      return "Confirmed";
    case "closed":
      return "Closed";
    case "rejected":
    case "unavailable":
      return "Unavailable";
    case "submitted":
    default:
      return "Submitted";
  }
}

function getNextStepText(status: string | null | undefined) {
  switch (status) {
    case "reviewed":
      return "The operator has reviewed your enquiry and may be following up with timing or availability details.";
    case "confirmed":
      return "Your enquiry is confirmed. You can review the final details or leave feedback once the trip is complete.";
    case "closed":
      return "This enquiry is closed. You can still revisit the details and share feedback if you have not already.";
    case "rejected":
    case "unavailable":
      return "The operator cannot take this enquiry right now. You can review the details or submit a new request later.";
    case "submitted":
    default:
      return "The operator will review your dates and preferences, then respond with the next steps.";
  }
}

function getContactChannel(operatorPhone: string | null, operatorEmail: string | null) {
  if (operatorPhone && operatorEmail) {
    return "WhatsApp + Email";
  }

  if (operatorPhone) {
    return "WhatsApp";
  }

  if (operatorEmail) {
    return "Email";
  }

  return "Open operator thread";
}

function stripDialableCharacters(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function buildWhatsAppHref(
  operatorPhone: string | null,
  inquiryId: string,
  listingTitle: string | null,
  travelerName: string | null,
) {
  if (!operatorPhone) {
    return null;
  }

  const phone = stripDialableCharacters(operatorPhone);
  if (!phone) {
    return null;
  }

  const message = [
    `Hello, I'm following up on enquiry ${inquiryId}.`,
    listingTitle ? `Listing: ${listingTitle}` : null,
    travelerName ? `Traveller: ${travelerName}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function buildMailtoHref(
  operatorEmail: string | null,
  inquiryId: string,
  listingTitle: string | null,
  travelerName: string | null,
) {
  if (!operatorEmail) {
    return null;
  }

  const subject = encodeURIComponent(`Enquiry ${inquiryId}${listingTitle ? ` - ${listingTitle}` : ""}`);
  const body = encodeURIComponent(
    [
      "Hello,",
      "",
    `I'm following up on enquiry ${inquiryId}.`,
      listingTitle ? `Listing: ${listingTitle}` : null,
      travelerName ? `Traveller: ${travelerName}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n"),
  );

  return `mailto:${operatorEmail}?subject=${subject}&body=${body}`;
}

const reviewSchema = z.object({
  inquiryId: z.string().uuid({ error: "Choose a valid enquiry." }),
  rating: z.coerce.number().int().min(1, { error: "Choose a rating." }).max(5, { error: "Choose a rating." }),
  comment: z.string().trim().max(2000, { error: "Keep your review under 2000 characters." }).optional().or(z.literal("")),
});

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const resolvedSearchParams = await searchParams;
  const inquiryId = resolvedSearchParams.inquiryId ?? resolvedSearchParams.inquiry ?? null;
  const profileContext = await getOptionalCurrentUserProfile();
  const profile = profileContext?.profile ?? null;

  const inquiry = inquiryId ? await getInquiryConfirmation(inquiryId, profile) : null;

  if (!inquiry) {
    return (
      <PageShell variant="public">
        <main className="mx-auto grid min-h-[calc(100dvh-4.75rem)] w-full max-w-5xl place-items-center px-5 py-12 md:px-10">
          <section className="w-full max-w-2xl rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm md:p-10">
              <p className="font-label-caps text-secondary">Enquiry status</p>
              <h1 className="mt-3 font-headline text-4xl font-light text-on-surface md:text-6xl">Submitted</h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-on-surface-variant">
                {inquiryId
                  ? "Your enquiry was submitted. We sent the next steps to the email address you provided. Private trip and contact details are only shown to signed-in account holders."
                  : "Choose an enquiry from your traveller profile, or submit a new request."}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="btn-primary" href="/Enquiry">
                  Explore experiences
                </Link>
                <Link
                  className="btn-outline"
                  href={profile ? getRoleDashboardRoute(profile.role) : "/LoginPage"}
                >
                  {profile ? "Open dashboard" : "Log in"}
                </Link>
              </div>
          </section>
        </main>
      </PageShell>
    );
  }

  const canShowReview = profile?.role === "traveler" && Boolean(inquiry.can_review);
  const showReviewForm = canShowReview && resolvedSearchParams.review === "1";
  const threadRole =
    profile?.role === "operator"
      ? "operator"
      : profile?.role === "traveler"
        ? "traveler"
        : null;
  const threadState = threadRole
    ? await getDirectMessagePageState({
        profile: profile as NonNullable<typeof profile>,
        role: threadRole,
        inquiryId: inquiry.id,
        markAsSeen: false,
      })
    : null;

  const activeConversation = threadState?.activeConversation ?? null;
  const threadMessages = threadState?.messages ?? [];
  const listingTitle = inquiry.listing?.title ?? inquiry.destination ?? null;
  const nextStep = getNextStepText(inquiry.status);
  const contactChannel = getContactChannel(inquiry.operator_phone ?? null, inquiry.operator_email ?? null);
  const paymentNotice = resolvedSearchParams.payment === "paid" || resolvedSearchParams.payment === "completed" || resolvedSearchParams.payment === "success"
    ? "WiPay sent you back after checkout. We are verifying the payment now."
    : resolvedSearchParams.payment === "cancelled"
      ? "Checkout was cancelled. No payment was taken."
      : null;
  const paymentErrorMessage = resolvedSearchParams.payment_error ?? null;
  const payment = inquiry.payment ?? null;
  const paymentAmount = resolveWiPayInquiryAmount(inquiry);
  const paymentStatusLabel =
    payment?.status === "paid" || payment?.status === "completed" || payment?.status === "success"
      ? "Paid"
      : payment?.status === "failed"
        ? "Failed"
        : payment?.status === "cancelled"
          ? "Cancelled"
          : payment?.status === "error"
            ? "Error"
          : payment?.status === "refunded"
            ? "Refunded"
              : payment?.status === "initiated"
                ? "Pending"
                : "Pending";
  const pendingCheckoutUrl = payment?.status === "pending" || payment?.status === "initiated" ? payment.checkout_url : null;
  const canStartPayment =
    profile?.role === "traveler" &&
    inquiry.status === "confirmed" &&
    Boolean(paymentAmount) &&
    payment?.status !== "paid" &&
    payment?.status !== "completed" &&
    payment?.status !== "success" &&
    payment?.status !== "initiated" &&
    payment?.status !== "pending";
  const whatsappHref = buildWhatsAppHref(
    inquiry.operator_phone ?? null,
    inquiry.id,
    listingTitle,
    inquiry.traveler_name ?? profile?.full_name ?? null,
  );
  const emailHref = buildMailtoHref(
    inquiry.operator_email ?? null,
    inquiry.id,
    listingTitle,
    inquiry.traveler_name ?? profile?.full_name ?? null,
  );

  async function submitInquiryReviewAction(
    _state: ReviewFormState,
    formData: FormData,
  ): Promise<ReviewFormState> {
    "use server";

    const profileContext = await getOptionalCurrentUserProfile();

    if (!profileContext?.profile) {
      return {
        ...initialReviewFormState,
        message: "Please sign in to leave a review.",
        fieldErrors: {},
      };
    }

    if (profileContext.profile.role !== "traveler") {
      return {
        ...initialReviewFormState,
        message: "Reviews can only be submitted from a traveller account.",
        fieldErrors: {},
      };
    }

    const validated = reviewSchema.safeParse({
      inquiryId: formData.get("inquiry_id"),
      rating: formData.get("rating"),
      comment: formData.get("comment"),
    });

    if (!validated.success) {
      return {
        ...initialReviewFormState,
        message: "Please review the highlighted fields.",
        fieldErrors: validated.error.flatten().fieldErrors,
      };
    }

    try {
      await submitTravelerReview({
        travelerId: profileContext.profile.id,
        travelerEmail: profileContext.profile.email,
        inquiryId: validated.data.inquiryId,
        rating: validated.data.rating,
        comment: validated.data.comment || null,
      });

      revalidatePath("/TravellerProfile");
      revalidatePath("/ConfirmationPage");

      return {
        message: "Your review has been saved.",
        success: true,
        fieldErrors: {},
      };
    } catch (error) {
      console.error("Unable to save traveler review from confirmation page", {
        inquiryId: validated.data.inquiryId,
        travelerId: profileContext.profile.id,
        error,
      });

      return {
        ...initialReviewFormState,
        message: "We could not save your review. Please try again.",
        fieldErrors: {},
      };
    }
  }

  return (
    <PageShell
      travelerProfile={
        profile?.role === "traveler"
          ? {
              id: profile.id,
              full_name: profile.full_name,
              profile_image_url: profile.profile_image_url,
              role: profile.role,
            }
          : null
      }
      variant={profile?.role === "operator" ? "operator" : profile?.role === "traveler" ? "traveler" : "public"}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Raleway:wght@200;300;400;600&family=Be+Vietnam+Pro:wght@300;400;600&display=swap');

        :root {
          --background: var(--tc-bg);
          --surface-container-lowest: var(--tc-surface);
          --surface-container-low: #f5efe6;
          --outline-variant: var(--tc-border);
          --on-surface: var(--tc-text);
          --on-surface-variant: var(--tc-muted);
          --secondary: var(--tc-red);
          --primary: var(--tc-red-dark);
        }

        * { box-sizing: border-box; }
        body {
          margin: 0;
          background:
            radial-gradient(circle at top left, rgba(197, 22, 29, 0.035), transparent 34%),
            radial-gradient(circle at top right, rgba(111, 98, 73, 0.035), transparent 32%),
            linear-gradient(180deg, #f8f5f1 0%, var(--background) 42%, #f1ede8 100%);
          font-family: 'Be Vietnam Pro', sans-serif;
          overflow-x: hidden;
          color: var(--on-surface);
        }
        a { color: inherit; text-decoration: none; }

        .wrap {
          max-width: 1440px;
          margin: 0 auto;
          padding: 0 24px 120px;
        }

        .grid {
          display: grid;
          min-width: 0;
          gap: 32px;
        }

        .panel {
          min-width: 0;
          padding: 48px;
          border: 1px solid rgba(17, 19, 24, 0.08);
          background: rgba(255, 253, 248, 0.9);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow: 0 18px 44px rgba(53, 39, 33, 0.08);
        }

        .eyebrow {
          margin: 0 0 16px;
          color: var(--secondary);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .title {
          margin: 0 0 24px;
          font-family: 'Raleway', sans-serif;
          font-size: 64px;
          line-height: 60px;
          letter-spacing: -0.03em;
          font-weight: 200;
          text-transform: lowercase;
          color: var(--on-surface);
        }

        .copy {
          margin: 0;
          max-width: 720px;
          color: var(--on-surface-variant);
          font-size: 18px;
          line-height: 28px;
          font-weight: 300;
        }

        .details {
          display: grid;
          gap: 24px;
          margin-top: 40px;
        }

        .chip {
          padding: 24px;
          border: 1px solid var(--outline-variant);
          background: var(--surface-container-lowest);
        }

        .label {
          margin: 0 0 8px;
          color: var(--secondary);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .value {
          margin: 0;
          font-family: 'Raleway', sans-serif;
          font-size: 32px;
          line-height: 40px;
          font-weight: 300;
          text-transform: lowercase;
        }

        .list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 16px;
        }

        .list li {
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(206, 197, 185, 0.3);
          color: var(--on-surface-variant);
          font-size: 16px;
          line-height: 24px;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-top: 32px;
        }

        .actions.tight {
          margin-top: 20px;
        }

        .button {
          padding: 14px 24px;
          border: 1px solid rgba(197, 22, 29, 0.18);
          background: rgba(255, 253, 248, 0.9);
          color: var(--secondary);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .button.primary {
          background: linear-gradient(135deg, var(--tc-red), var(--tc-red-dark));
          color: white;
          border-color: rgba(197, 22, 29, 0.28);
        }

        .button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: 1.15fr .85fr;
          gap: 32px;
        }

        .detail-grid {
          display: grid;
          gap: 12px;
          margin-top: 20px;
        }

        .detail-row {
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(206, 197, 185, 0.3);
          color: var(--on-surface-variant);
          font-size: 16px;
          line-height: 24px;
          margin: 0;
        }

        .detail-row strong {
          color: var(--on-surface);
        }

        .status-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 16px;
        }

        .status-chip,
        .channel-chip {
          display: inline-flex;
          align-items: center;
          min-height: 2.2rem;
          padding: 0.4rem 0.85rem;
          border: 1px solid rgba(197, 22, 29, 0.18);
          background: rgba(255, 253, 248, 0.9);
          color: var(--secondary);
          font-size: 11px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .channel-chip {
          justify-content: center;
        }

        .payment-card {
          display: grid;
          gap: 16px;
          margin-top: 24px;
          padding: 20px;
          border: 1px solid rgba(17, 19, 24, 0.08);
          background: rgba(255, 253, 248, 0.92);
        }

        .payment-meta {
          display: grid;
          gap: 6px;
          color: var(--on-surface-variant);
          font-size: 15px;
          line-height: 24px;
        }

        .payment-meta strong {
          color: var(--on-surface);
        }

        .payment-status {
          display: inline-flex;
          align-items: center;
          min-height: 2rem;
          width: fit-content;
          padding: 0.35rem 0.8rem;
          border: 1px solid rgba(197, 22, 29, 0.18);
          background: rgba(243, 222, 214, 0.48);
          color: var(--secondary);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .payment-status.success {
          background: rgba(197, 22, 29, 0.08);
          color: var(--primary);
        }

        .payment-status.error,
        .payment-status.failed {
          background: rgba(197, 22, 29, 0.08);
          color: var(--secondary);
        }

        .listing-image {
          position: relative;
          min-height: 280px;
          overflow: hidden;
          border: 1px solid var(--outline-variant);
          background: var(--surface-container-lowest);
          margin-bottom: 24px;
        }

        .listing-image img {
          object-fit: cover;
        }

        .thread-card {
          display: grid;
          gap: 16px;
          padding: 22px;
          border: 1px solid rgba(17, 19, 24, 0.08);
          border-radius: 20px;
          background: rgba(255, 253, 248, 0.92);
          box-shadow: 0 18px 40px rgba(53, 39, 33, 0.06);
          margin-top: 24px;
        }

        .thread-list {
          display: grid;
          gap: 12px;
        }

        .thread-message {
          display: grid;
          gap: 6px;
          padding: 14px 16px;
          border: 1px solid rgba(17, 19, 24, 0.08);
          border-radius: 16px;
          background: rgba(255, 253, 248, 0.96);
          color: var(--on-surface-variant);
          box-shadow: 0 10px 24px rgba(53, 39, 33, 0.04);
        }

        .thread-message.own {
          border-color: rgba(197, 22, 29, 0.14);
          background: rgba(243, 222, 214, 0.7);
          color: var(--on-surface);
          margin-left: 18px;
        }

        .thread-message-meta {
          font-size: 11px;
          line-height: 16px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--secondary);
          font-weight: 600;
        }

        .review-panel {
          margin-top: 28px;
          padding: 28px;
          border: 1px solid rgba(17, 19, 24, 0.08);
          background: rgba(255, 253, 248, 0.9);
        }

        .review-panel h3 {
          margin: 0;
          font-family: 'Raleway', sans-serif;
          font-size: 28px;
          line-height: 34px;
          font-weight: 300;
        }

        .review-panel p {
          margin: 12px 0 0;
          color: var(--on-surface-variant);
          font-size: 15px;
          line-height: 24px;
        }

        .review-form {
          display: grid;
          gap: 16px;
          margin-top: 18px;
        }

        .review-field {
          display: grid;
          gap: 8px;
        }

        .review-field label {
          color: var(--secondary);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .review-field select,
        .review-field textarea {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid rgba(206, 197, 185, 0.32);
          background: rgba(255,255,255,.82);
          color: var(--on-surface);
        }

        .review-field textarea {
          resize: vertical;
          min-height: 120px;
        }

        .review-field-error,
        .review-status {
          margin: 0;
          font-size: 14px;
          line-height: 22px;
        }

        .review-field-error,
        .review-status.error {
          color: var(--secondary);
        }

        .review-status.success {
          color: var(--primary);
        }

        @media (min-width: 768px) {
          .wrap { padding: 0 80px 120px; }
          .title { font-size: 120px; line-height: 110px; }
        }

        @media (max-width: 900px) {
          .summary-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>

      <main className="wrap">
        <section className="grid">
          <div className="panel">
            <p className="eyebrow">Enquiry confirmed</p>
            <h1 className="title">{getInquiryStatusLabel(inquiry.status).toLowerCase()}</h1>
            <p className="copy">{getNextStepText(inquiry.status)}</p>
            {paymentNotice ? <p className="copy" style={{ marginTop: 12 }}>{paymentNotice}</p> : null}
            {paymentErrorMessage ? <p className="copy" style={{ marginTop: 12, color: "var(--secondary)" }}>{paymentErrorMessage}</p> : null}

            <div className="details">
              <div className="chip">
                <p className="label">Reference</p>
                <p className="value">{inquiry.id.slice(0, 8).toUpperCase()}</p>
              </div>
              <div className="chip">
                <p className="label">Channel</p>
                {whatsappHref || emailHref ? (
                  <div className="status-row" style={{ marginTop: 0 }}>
                    {whatsappHref ? (
                      <a className="channel-chip" href={whatsappHref} rel="noreferrer" target="_blank">
                        WhatsApp Operator
                      </a>
                    ) : null}
                    {emailHref ? (
                      <a className="channel-chip" href={emailHref}>
                        Email Operator
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <Link className="channel-chip" href={`/Messages?inquiry=${inquiry.id}`}>
                    Open operator thread
                  </Link>
                )}
              </div>
              <div className="chip">
                <p className="label">Status</p>
                <p className="value">{getInquiryStatusLabel(inquiry.status)}</p>
              </div>
            </div>
          </div>

          <div className="summary-grid">
            <div className="panel">
              <p className="eyebrow">Enquiry details</p>
              {inquiry.listing?.image_url ? (
                <div className="listing-image">
                  <Image fill alt={inquiry.listing.title} sizes="(max-width: 768px) 100vw, 40vw" src={inquiry.listing.image_url} />
                </div>
              ) : null}

              <div className="detail-grid">
                <p className="detail-row">
                  <strong>Traveller:</strong> {inquiry.traveler_name}
                </p>
                <p className="detail-row">
                  <strong>Email:</strong> {inquiry.traveler_email}
                </p>
                <p className="detail-row">
                  <strong>Listing:</strong> {listingTitle ?? inquiry.destination}
                </p>
                <p className="detail-row">
                  <strong>Operator:</strong> {inquiry.operator_name}
                </p>
                <p className="detail-row">
                  <strong>Dates:</strong> {formatDate(inquiry.preferred_start_date)} to {formatDate(inquiry.preferred_end_date)}
                </p>
                <p className="detail-row">
                  <strong>Submitted:</strong> {formatDate(inquiry.created_at)}
                </p>
                <p className="detail-row">
                  <strong>Message:</strong> {inquiry.notes || "No notes were provided."}
                </p>
              </div>

              <div className="status-row">
                <span className="status-chip">{getInquiryStatusLabel(inquiry.status)}</span>
                <span className="status-chip">{contactChannel}</span>
              </div>

              {inquiry.status === "confirmed" || Boolean(payment) || Boolean(resolvedSearchParams.payment) ? (
                <div className="payment-card">
                  <div>
                    <p className="eyebrow" style={{ marginBottom: 8 }}>
                      Payment
                    </p>
                    <h3 style={{ margin: 0, fontFamily: "Raleway, sans-serif", fontSize: "28px", lineHeight: "34px", fontWeight: 300 }}>
                      WiPay checkout
                    </h3>
                  </div>

                  <div className="payment-meta">
                    <div>
                      <strong>Amount:</strong> {paymentAmount ?? "Not set yet"}
                    </div>
                    <div>
                      <strong>Status:</strong>{" "}
                      <span className={`payment-status ${payment?.status ?? "pending"}`}>{paymentStatusLabel}</span>
                    </div>
                    {payment?.transaction_id ? (
                      <div>
                        <strong>Transaction:</strong> {payment.transaction_id}
                      </div>
                    ) : null}
                    {payment?.order_id ? (
                      <div>
                        <strong>Order ID:</strong> {payment.order_id}
                      </div>
                    ) : null}
                  </div>

                  {pendingCheckoutUrl ? (
                    <div className="actions tight">
                      <a className="button primary" href={pendingCheckoutUrl} rel="noreferrer" target="_blank">
                        Continue WiPay checkout
                      </a>
                    </div>
                  ) : canStartPayment ? (
                    <form action="/api/payments/wipay/start" method="post">
                      <input name="inquiry_id" type="hidden" value={inquiry.id} />
                      <div className="actions tight">
                        <button className="button primary" type="submit">
                          Pay with WiPay
                        </button>
                      </div>
                    </form>
                  ) : payment?.status === "paid" || payment?.status === "completed" || payment?.status === "success" ? (
                    <p style={{ margin: 0, color: "var(--primary)", fontSize: "15px", lineHeight: "24px" }}>
                      Payment has been confirmed.
                    </p>
                  ) : (
                    <p style={{ margin: 0, color: "var(--on-surface-variant)", fontSize: "15px", lineHeight: "24px" }}>
                      Payment checkout will unlock once this inquiry is confirmed.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="actions tight">
                <Link className="button primary" href="/Enquiry">
                  Return to inquiry
                </Link>
                <Link className="button" href="/TravellerProfile">
                  View profile
                </Link>
                <Link className="button" href={`/Messages?inquiry=${inquiry.id}`}>
                  Message Operator
                </Link>
              </div>
            </div>

            <div className="panel">
              <p className="eyebrow">Next steps</p>
              <ul className="list">
                <li>{nextStep}</li>
                <li>The operator reviews your preferred dates and availability window.</li>
                <li>You can return here anytime to review the enquiry details.</li>
              </ul>

              <div className="actions">
                <Link className="button" href="/ConciergeChat">
                  Ask AI Concierge
                </Link>
                {whatsappHref ? (
                  <a className="button primary" href={whatsappHref} rel="noreferrer" target="_blank">
                    WhatsApp Operator
                  </a>
                ) : null}
                {!whatsappHref && emailHref ? (
                  <a className="button primary" href={emailHref}>
                    Email Operator
                  </a>
                ) : null}
              </div>

              <div className="thread-card">
                <div>
                  <p className="eyebrow" style={{ marginBottom: "8px" }}>
                    Messages
                  </p>
                  <h3 style={{ margin: 0 }}>
                    {activeConversation ? activeConversation.title : "No messages yet"}
                  </h3>
                  <p style={{ margin: "8px 0 0", color: "var(--on-surface-variant)", fontSize: "15px", lineHeight: "24px" }}>
                    {activeConversation
                      ? activeConversation.subtitle
                      : "Message the operator to start a private thread tied to this enquiry."}
                  </p>
                </div>

                {threadMessages.length ? (
                  <div className="thread-list">
                    {threadMessages.slice(-4).map((message) => (
                      <div
                        key={message.id}
                        className={`thread-message ${message.sender_id === profile?.id ? "own" : ""}`}
                      >
                        <div className="thread-message-meta">
                          {message.sender_id === profile?.id ? "You" : activeConversation?.counterpart_name ?? "Operator"} · {formatDate(message.created_at)}
                        </div>
                        <p style={{ margin: 0 }}>{message.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: "var(--on-surface-variant)", fontSize: "15px", lineHeight: "24px" }}>
                    No messages have been sent on this inquiry yet.
                  </p>
                )}

                <div className="actions tight">
                  <Link className="button primary" href={`/Messages?inquiry=${inquiry.id}`}>
                    Open messages
                  </Link>
                </div>
              </div>

              {profile?.role === "traveler" ? (
                <div className="review-panel" id="review">
                  <h3>{inquiry.has_review ? "Your review" : "Leave a review"}</h3>
                  <p>
                    {inquiry.has_review
                      ? "This enquiry already has a traveller review on file."
                      : "Share feedback once the enquiry is confirmed or closed."}
                  </p>

                  {inquiry.has_review ? null : canShowReview ? (
                    showReviewForm ? (
                      <ReviewForm action={submitInquiryReviewAction} inquiryId={inquiry.id} defaultOpen />
                    ) : (
                      <div className="actions tight">
                        <Link className="button primary" href={`/ConfirmationPage?inquiryId=${inquiry.id}&review=1#review`}>
                          Open review form
                        </Link>
                      </div>
                    )
                  ) : (
                    <p style={{ marginBottom: 0 }}>
                      Reviews will unlock once the inquiry is confirmed or closed.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
