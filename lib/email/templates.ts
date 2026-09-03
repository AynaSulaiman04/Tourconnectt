import "server-only";

import { toBritishUserCopy } from "@/lib/copy/british-english";
import { formatDate, formatDateTime } from "@/lib/format/date";

export type EmailMessage = {
  subject: string;
  html: string;
  text: string;
};

type BaseEmailData = {
  appUrl: string;
  travelerName: string;
  listingTitle: string | null;
  operatorName: string | null;
  preferredStartDate: string | null;
  preferredEndDate: string | null;
};

type InquirySubmissionData = BaseEmailData & {
  inquiryId: string;
  submittedAt: string | null;
  travelerEmail: string;
  travelerPhone: string | null;
  availability: string | null;
  notes: string | null;
  destination: string | null;
  operatorEmail: string | null;
};

type OperatorInquiryNotificationData = BaseEmailData & {
  inquiryId: string;
  travelerEmail: string;
  travelerPhone: string | null;
  availability: string | null;
  notes: string | null;
  destination: string | null;
  operatorEmail: string | null;
};

type BookingConfirmationData = BaseEmailData & {
  inquiryId: string;
  confirmedAt: string;
  operatorEmail: string | null;
  notes: string | null;
};

type ReminderData = BaseEmailData & {
  inquiryId: string;
  tripDateTime: string | null;
  operatorContact: string | null;
};

type InstructionsData = BaseEmailData & {
  inquiryId: string;
  tripDateTime: string | null;
  meetingPoint: string | null;
  instructions: string | null;
};

type ReviewRequestData = BaseEmailData & {
  inquiryId: string;
  reviewLink: string;
};

type OperatorReplyData = {
  appUrl: string;
  travelerName: string | null;
  operatorName: string;
  listingTitle: string | null;
  inquiryId: string | null;
  replyMessage: string;
};

type PaymentSuccessData = {
  appUrl: string;
  travelerName: string | null;
  operatorName: string | null;
  listingTitle: string | null;
  destination: string | null;
  inquiryId: string;
  amount: string | null;
  paidAt: string | null;
  orderId: string | null;
};

type OperatorPaymentReceivedData = {
  appUrl: string;
  operatorName: string | null;
  travelerName: string | null;
  listingTitle: string | null;
  destination: string | null;
  inquiryId: string;
  amount: string | null;
  paidAt: string | null;
  orderId: string | null;
  operatorPayoutAmount: string | null;
  adminCommissionAmount: string | null;
};

type AdminPaidBookingData = {
  appUrl: string;
  travelerName: string | null;
  operatorName: string | null;
  listingTitle: string | null;
  destination: string | null;
  inquiryId: string;
  amount: string | null;
  paidAt: string | null;
  orderId: string | null;
  operatorPayoutAmount: string | null;
  adminCommissionAmount: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function signupConfirmationEmail(data: {
  fullName: string;
  confirmationUrl: string;
}): EmailMessage {
  return renderEmailShell({
    title: "Confirm your Tour ConnecTT account",
    preheader: "Confirm your email address to finish creating your account.",
    heading: "confirm your account",
    intro: `Hi ${displayValue(data.fullName, "traveller")}, thanks for joining Tour ConnecTT. Confirm your email address and you can start planning straight away.`,
    sections: [
      {
        label: "Why this step",
        value:
          "Confirming your address lets operators reach you about your enquiries, and keeps your bookings and payments tied to an address you control.",
      },
      {
        label: "If you did not sign up",
        value: "Ignore this email and no account will be created. The link expires on its own.",
      },
    ],
    cta: {
      label: "Confirm my email",
      href: data.confirmationUrl,
    },
  });
}

export function operatorReplyTravelerEmail(data: OperatorReplyData): EmailMessage {
  return renderEmailShell({
    title: `New reply from ${displayValue(data.operatorName, "your operator")}`,
    preheader: `${displayValue(data.operatorName, "Your operator")} replied to your inquiry.`,
    heading: "new operator reply",
    intro: `Hi ${displayValue(data.travelerName, "traveler")}, ${displayValue(data.operatorName, "your operator")} replied to your inquiry${data.listingTitle ? ` for ${data.listingTitle}` : ""}.`,
    sections: [
      { label: "Operator", value: displayValue(data.operatorName, "Operator") },
      { label: "Listing", value: displayValue(data.listingTitle, "Direct conversation") },
      { label: "Reply", value: data.replyMessage },
      { label: "Next step", value: "Keep this email for your records, or sign in to continue the conversation." },
    ],
    cta: {
      label: "Open traveler inbox",
      href: data.inquiryId
        ? new URL(`/Messages?inquiry=${encodeURIComponent(data.inquiryId)}`, data.appUrl).toString()
        : new URL("/Messages", data.appUrl).toString(),
    },
  });
}

export function travelerPaymentSuccessEmail(data: PaymentSuccessData): EmailMessage {
  return renderEmailShell({
    title: `Payment confirmed for ${displayValue(data.listingTitle, displayValue(data.destination, "your booking"))}`,
    preheader: "Your WiPay payment has been confirmed and your booking is now secured.",
    heading: "payment confirmed",
    intro: `Hi ${displayValue(data.travelerName, "traveler")}, your WiPay payment was confirmed successfully and your booking is now secured.`,
    sections: [
      { label: "Listing", value: displayValue(data.listingTitle, displayValue(data.destination, "Confirmed booking")) },
      { label: "Operator", value: displayValue(data.operatorName, "Operator") },
      { label: "Paid amount", value: displayValue(data.amount, "Processed successfully") },
      { label: "Paid at", value: formatDateTime(data.paidAt) },
      { label: "Order reference", value: displayValue(data.orderId, data.inquiryId) },
    ],
    cta: {
      label: "Open traveler profile",
      href: new URL(`/TravellerProfile?inquiryId=${encodeURIComponent(data.inquiryId)}&payment=paid`, data.appUrl).toString(),
    },
  });
}

export function operatorPaymentReceivedEmail(data: OperatorPaymentReceivedData): EmailMessage {
  return renderEmailShell({
    title: `Traveler payment received for ${displayValue(data.listingTitle, displayValue(data.destination, "your booking"))}`,
    preheader: "A traveler payment was confirmed through WiPay.",
    heading: "traveler payment received",
    intro: `A traveler payment has been confirmed for your booking${data.travelerName ? ` with ${data.travelerName}` : ""}.`,
    sections: [
      { label: "Traveler", value: displayValue(data.travelerName, "Traveler") },
      { label: "Listing", value: displayValue(data.listingTitle, displayValue(data.destination, "Confirmed booking")) },
      { label: "Paid amount", value: displayValue(data.amount, "Processed successfully") },
      { label: "Operator payout (80%)", value: displayValue(data.operatorPayoutAmount, "Calculated automatically") },
      { label: "Platform commission (20%)", value: displayValue(data.adminCommissionAmount, "Calculated automatically") },
      { label: "Paid at", value: formatDateTime(data.paidAt) },
      { label: "Order reference", value: displayValue(data.orderId, data.inquiryId) },
    ],
    cta: {
      label: "Open operator dashboard",
      href: new URL("/OperatorDashboard?paymentStatus=paid", data.appUrl).toString(),
    },
  });
}

export function adminPaidBookingNotificationEmail(data: AdminPaidBookingData): EmailMessage {
  return renderEmailShell({
    title: `New paid booking: ${displayValue(data.listingTitle, displayValue(data.destination, "Tour ConnecTT booking"))}`,
    preheader: "A traveler payment was confirmed and the booking is now paid.",
    heading: "new paid booking",
    intro: "A WiPay payment has been confirmed and the booking is now fully paid.",
    sections: [
      { label: "Traveler", value: displayValue(data.travelerName, "Traveler") },
      { label: "Operator", value: displayValue(data.operatorName, "Operator") },
      { label: "Listing", value: displayValue(data.listingTitle, displayValue(data.destination, "Confirmed booking")) },
      { label: "Paid amount", value: displayValue(data.amount, "Processed successfully") },
      { label: "Platform commission (20%)", value: displayValue(data.adminCommissionAmount, "Calculated automatically") },
      { label: "Operator payout (80%)", value: displayValue(data.operatorPayoutAmount, "Calculated automatically") },
      { label: "Paid at", value: formatDateTime(data.paidAt) },
      { label: "Order reference", value: displayValue(data.orderId, data.inquiryId) },
    ],
    cta: {
      label: "Open admin bookings",
      href: new URL(`/AdminBookings?inquiry=${encodeURIComponent(data.inquiryId)}`, data.appUrl).toString(),
    },
  });
}

function displayValue(value: string | null | undefined, fallback: string) {
  return value && value.trim().length > 0 ? value : fallback;
}

function renderEmailShell(params: {
  title: string;
  preheader: string;
  heading: string;
  intro: string;
  sections: Array<{ label: string; value: string }>;
  cta?: { label: string; href: string };
}) {
  const title = toBritishUserCopy(params.title);
  const preheader = toBritishUserCopy(params.preheader);
  const heading = toBritishUserCopy(params.heading);
  const intro = toBritishUserCopy(params.intro);
  const sections = params.sections.map((section) => ({
    label: toBritishUserCopy(section.label),
    value: toBritishUserCopy(section.value),
  }));
  const cta = params.cta
    ? { label: toBritishUserCopy(params.cta.label), href: params.cta.href }
    : undefined;

  const sectionRows = sections
    .map(
      (section) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eadfd3;">
            <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a0401b;font-weight:700;margin-bottom:4px;">
              ${escapeHtml(section.label)}
            </div>
            <div style="font-size:15px;line-height:24px;color:#1c1b1b;">
              ${escapeHtml(section.value)}
            </div>
          </td>
        </tr>`,
    )
    .join("");

  return {
    subject: title,
    html: `<!doctype html>
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>${escapeHtml(title)}</title>
        </head>
        <body style="margin:0;background:#fcf9f8;font-family:Arial,Helvetica,sans-serif;color:#1c1b1b;">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
            ${escapeHtml(preheader)}
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fcf9f8;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #eadfd3;border-radius:24px;overflow:hidden;">
                  <tr>
                    <td style="padding:32px 32px 24px;">
                      <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#a0401b;font-weight:700;margin-bottom:14px;">Tour ConnecTT</div>
                      <h1 style="margin:0;font-size:28px;line-height:34px;font-weight:300;letter-spacing:-.03em;text-transform:lowercase;color:#1c1b1b;">
                        ${escapeHtml(heading)}
                      </h1>
                      <p style="margin:16px 0 0;font-size:16px;line-height:26px;color:#4b463d;">
                        ${escapeHtml(intro)}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${sectionRows}</table>
                    </td>
                  </tr>
                  ${
                    cta
                      ? `<tr>
                          <td style="padding:0 32px 32px;">
                            <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:linear-gradient(135deg,#c5161d,#8f0f14);color:#ffffff;text-decoration:none;font-size:12px;line-height:16px;letter-spacing:.16em;font-weight:700;text-transform:uppercase;">
                              ${escapeHtml(cta.label)}
                            </a>
                          </td>
                        </tr>`
                      : ""
                  }
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>`,
    text: [
      heading,
      "",
      intro,
      "",
      ...sections.map((section) => `${section.label}: ${section.value}`),
      cta ? `\n${cta.label}: ${cta.href}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function buildInquiryConfirmationEmail(data: InquirySubmissionData): EmailMessage {
  return renderEmailShell({
    title: "Inquiry received",
    preheader: `Your inquiry for ${displayValue(data.listingTitle, "a live experience")} is in progress.`,
    heading: "your inquiry is received",
    intro: `Hi ${displayValue(data.travelerName, "traveler")}, we have received your inquiry and will keep the conversation moving from here.`,
    sections: [
      { label: "Listing", value: displayValue(data.listingTitle, displayValue(data.destination, "Selected experience")) },
      { label: "Operator", value: displayValue(data.operatorName, "Operator") },
      { label: "Inquiry date", value: formatDateTime(data.submittedAt) },
      { label: "Preferred dates", value: `${formatDate(data.preferredStartDate)} to ${formatDate(data.preferredEndDate)}` },
      { label: "Availability", value: displayValue(data.availability, "Flexible") },
      { label: "Notes", value: displayValue(data.notes, "No notes were provided.") },
      { label: "Traveler email", value: data.travelerEmail },
      { label: "Traveler phone", value: displayValue(data.travelerPhone, "Not provided") },
    ],
    cta: {
      label: "Open TT Connect",
      href: data.appUrl,
    },
  });
}

export function inquirySubmittedTravelerEmail(params: {
  travelerName: string;
  listingTitle: string;
  destination?: string;
}) {
  const subject = toBritishUserCopy(`Enquiry received for ${params.listingTitle}`);
  const html = toBritishUserCopy(`
      <div style="font-family: Arial, sans-serif; color: #111318;">
        <h2>Your enquiry has been received</h2>
        <p>Hi ${escapeHtml(params.travelerName)},</p>
        <p>We received your enquiry for <strong>${escapeHtml(params.listingTitle)}</strong>.</p>
        ${params.destination ? `<p>Destination: <strong>${escapeHtml(params.destination)}</strong></p>` : ""}
        <p>The operator will review your request and reply soon.</p>
        <br />
        <p>Tour ConnecTT</p>
      </div>
    `);
  const text = toBritishUserCopy(
    `Your enquiry has been received\n\nHi ${params.travelerName},\nWe received your enquiry for ${params.listingTitle}.${params.destination ? `\nDestination: ${params.destination}` : ""}\nThe operator will review your request and reply soon.\n\nTour ConnecTT`,
  );

  return { subject, html, text } satisfies EmailMessage;
}

export function buildOperatorInquiryNotificationEmail(data: OperatorInquiryNotificationData): EmailMessage {
  return renderEmailShell({
    title: "New inquiry received",
    preheader: `A new inquiry was submitted for ${displayValue(data.listingTitle, "your listing")}.`,
    heading: "new inquiry received",
    intro: `A traveler has submitted an inquiry for your listing. Review the details and continue the follow-up from TT Connect.`,
    sections: [
      { label: "Traveler", value: data.travelerName },
      { label: "Traveler email", value: data.travelerEmail },
      { label: "Listing", value: displayValue(data.listingTitle, displayValue(data.destination, "Selected experience")) },
      { label: "Operator", value: displayValue(data.operatorName, "Operator") },
      { label: "Preferred dates", value: `${formatDate(data.preferredStartDate)} to ${formatDate(data.preferredEndDate)}` },
      { label: "Availability", value: displayValue(data.availability, "Flexible") },
      { label: "Message", value: displayValue(data.notes, "No notes were provided.") },
    ],
    cta: {
      label: "Open operator dashboard",
      href: new URL("/OperatorDashboard", data.appUrl).toString(),
    },
  });
}

export function newInquiryOperatorEmail(params: {
  operatorName?: string;
  travelerName: string;
  listingTitle: string;
  preferredStartDate?: string;
  preferredEndDate?: string;
}) {
  const subject = toBritishUserCopy(`New enquiry for ${params.listingTitle}`);
  const html = toBritishUserCopy(`
      <div style="font-family: Arial, sans-serif; color: #111318;">
        <h2>New traveller enquiry</h2>
        <p>Hi ${escapeHtml(params.operatorName || "Operator")},</p>
        <p><strong>${escapeHtml(params.travelerName)}</strong> submitted an enquiry for <strong>${escapeHtml(params.listingTitle)}</strong>.</p>
        ${params.preferredStartDate ? `<p>Preferred start: ${escapeHtml(params.preferredStartDate)}</p>` : ""}
        ${params.preferredEndDate ? `<p>Preferred end: ${escapeHtml(params.preferredEndDate)}</p>` : ""}
        <p>Please log in to your operator dashboard to review and respond.</p>
        <br />
        <p>Tour ConnecTT</p>
      </div>
    `);
  const text = toBritishUserCopy(
    `New traveller enquiry\n\nHi ${params.operatorName || "Operator"},\n${params.travelerName} submitted an enquiry for ${params.listingTitle}.${params.preferredStartDate ? `\nPreferred start: ${params.preferredStartDate}` : ""}${params.preferredEndDate ? `\nPreferred end: ${params.preferredEndDate}` : ""}\nPlease log in to your operator dashboard to review and respond.\n\nTour ConnecTT`,
  );

  return { subject, html, text } satisfies EmailMessage;
}

export function buildBookingConfirmedEmail(data: BookingConfirmationData): EmailMessage {
  return renderEmailShell({
    title: "Trip confirmed",
    preheader: `Your trip for ${displayValue(data.listingTitle, "your experience")} is confirmed.`,
    heading: "your trip is confirmed",
    intro: `Hi ${displayValue(data.travelerName, "traveler")}, your trip has been confirmed and the next step is to review the final details before departure.`,
    sections: [
      { label: "Listing", value: displayValue(data.listingTitle, "Selected experience") },
      { label: "Operator", value: displayValue(data.operatorName, "Operator") },
      { label: "Confirmation date", value: formatDateTime(data.confirmedAt) },
      { label: "Preferred dates", value: `${formatDate(data.preferredStartDate)} to ${formatDate(data.preferredEndDate)}` },
      { label: "Notes", value: displayValue(data.notes, "No notes were provided.") },
    ],
    cta: {
      label: "View your confirmation",
      href: new URL(`/ConfirmationPage?inquiryId=${encodeURIComponent(data.inquiryId)}`, data.appUrl).toString(),
    },
  });
}

export function buildBookingReminderEmail(data: ReminderData): EmailMessage {
  return renderEmailShell({
    title: "Booking reminder",
    preheader: `A reminder for ${displayValue(data.listingTitle, "your upcoming trip")}.`,
    heading: "booking reminder",
    intro: `Hi ${displayValue(data.travelerName, "traveler")}, here is a reminder for your upcoming trip.`,
    sections: [
      { label: "Listing", value: displayValue(data.listingTitle, "Selected experience") },
      { label: "Operator", value: displayValue(data.operatorName, "Operator") },
      { label: "Trip date/time", value: formatDateTime(data.tripDateTime) },
      { label: "Operator contact", value: displayValue(data.operatorContact, "Not provided") },
      { label: "Preferred dates", value: `${formatDate(data.preferredStartDate)} to ${formatDate(data.preferredEndDate)}` },
    ],
    cta: {
      label: "Open TT Connect",
      href: data.appUrl,
    },
  });
}

export function buildPreTourInstructionsEmail(data: InstructionsData): EmailMessage {
  return renderEmailShell({
    title: "Pre-tour instructions",
    preheader: `Instructions for ${displayValue(data.listingTitle, "your upcoming trip")}.`,
    heading: "pre-tour instructions",
    intro: `Hi ${displayValue(data.travelerName, "traveler")}, here are the details you should review before your tour.`,
    sections: [
      { label: "Listing", value: displayValue(data.listingTitle, "Selected experience") },
      { label: "Operator", value: displayValue(data.operatorName, "Operator") },
      { label: "Trip date/time", value: formatDateTime(data.tripDateTime) },
      { label: "Meeting point", value: displayValue(data.meetingPoint, "To be confirmed by the operator") },
      { label: "Instructions", value: displayValue(data.instructions, "No additional instructions were provided.") },
    ],
    cta: {
      label: "Open TT Connect",
      href: data.appUrl,
    },
  });
}

export function buildPostTourReviewRequestEmail(data: ReviewRequestData): EmailMessage {
  return renderEmailShell({
    title: "Share your review",
    preheader: `We’d love your review for ${displayValue(data.listingTitle, "your trip")}.`,
    heading: "share your review",
    intro: `Hi ${displayValue(data.travelerName, "traveler")}, your trip has wrapped up and we’d love your feedback.`,
    sections: [
      { label: "Listing", value: displayValue(data.listingTitle, "Selected experience") },
      { label: "Operator", value: displayValue(data.operatorName, "Operator") },
      { label: "Review link", value: data.reviewLink },
    ],
    cta: {
      label: "Leave a review",
      href: data.reviewLink,
    },
  });
}
