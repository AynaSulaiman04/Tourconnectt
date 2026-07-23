import "server-only";

import nodemailer from "nodemailer";
import {
  adminPaidBookingNotificationEmail,
  buildBookingConfirmedEmail,
  buildBookingReminderEmail,
  buildInquiryConfirmationEmail,
  buildOperatorInquiryNotificationEmail,
  buildPostTourReviewRequestEmail,
  buildPreTourInstructionsEmail,
  operatorPaymentReceivedEmail,
  operatorReplyTravelerEmail,
  travelerPaymentSuccessEmail,
} from "./templates";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult = {
  ok: boolean;
  error?: string;
};

type SmtpConfig =
  | {
      ok: true;
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
    }
  | {
      ok: false;
      error: string;
    };

function readSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const portValue = process.env.SMTP_PORT?.trim();
  const secureValue = process.env.SMTP_SECURE?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim() || process.env.SMTP_APP_PASSWORD?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  const missing = [
    !host ? "SMTP_HOST" : null,
    !portValue ? "SMTP_PORT" : null,
    !secureValue ? "SMTP_SECURE" : null,
    !user ? "SMTP_USER" : null,
    !pass ? "SMTP_PASS or SMTP_APP_PASSWORD" : null,
  ].filter(Boolean);

  if (missing.length) {
    return {
      ok: false,
      error: `Missing SMTP environment variables: ${missing.join(", ")}`,
    };
  }

  const port = Number(portValue);

  if (!Number.isInteger(port) || port <= 0) {
    return {
      ok: false,
      error: "SMTP_PORT must be a valid port number.",
    };
  }

  return {
    ok: true,
    host: host as string,
    port,
    secure: secureValue === "true",
    user: user as string,
    pass: pass as string,
    from: from as string,
  };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = readSmtpConfig();

  if (!config.ok) {
    return config;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    await transporter.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send email.";
    console.error("Email send failed", {
      to: input.to,
      subject: input.subject,
      error: message,
    });
    return { ok: false, error: message };
  }
}

function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!appUrl) {
    return "http://localhost:3000";
  }

  return appUrl.replace(/\/+$/, "");
}

function cleanUrl(pathname: string) {
  return new URL(pathname, getAppUrl()).toString();
}

export async function sendInquiryConfirmationEmail(params: {
  to: string;
  inquiryId: string;
  submittedAt: string | null;
  travelerName: string;
  travelerEmail: string;
  travelerPhone: string | null;
  listingTitle: string | null;
  operatorName: string | null;
  preferredStartDate: string | null;
  preferredEndDate: string | null;
  availability: string | null;
  notes: string | null;
  destination: string | null;
}) {
  try {
    const message = buildInquiryConfirmationEmail({
      appUrl: getAppUrl(),
      inquiryId: params.inquiryId,
      submittedAt: params.submittedAt,
      travelerName: params.travelerName,
      travelerEmail: params.travelerEmail,
      travelerPhone: params.travelerPhone,
      listingTitle: params.listingTitle,
      operatorName: params.operatorName,
      preferredStartDate: params.preferredStartDate,
      preferredEndDate: params.preferredEndDate,
      availability: params.availability,
      notes: params.notes,
      destination: params.destination,
      operatorEmail: null,
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build inquiry confirmation email.",
    };
  }
}

export async function sendOperatorInquiryNotificationEmail(params: {
  to: string;
  inquiryId: string;
  travelerName: string;
  travelerEmail: string;
  travelerPhone: string | null;
  listingTitle: string | null;
  operatorName: string | null;
  preferredStartDate: string | null;
  preferredEndDate: string | null;
  availability: string | null;
  notes: string | null;
  destination: string | null;
}) {
  try {
    const message = buildOperatorInquiryNotificationEmail({
      appUrl: getAppUrl(),
      inquiryId: params.inquiryId,
      travelerName: params.travelerName,
      travelerEmail: params.travelerEmail,
      travelerPhone: params.travelerPhone,
      listingTitle: params.listingTitle,
      operatorName: params.operatorName,
      preferredStartDate: params.preferredStartDate,
      preferredEndDate: params.preferredEndDate,
      availability: params.availability,
      notes: params.notes,
      destination: params.destination,
      operatorEmail: params.to,
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build operator inquiry email.",
    };
  }
}

export async function sendBookingConfirmedEmail(params: {
  to: string;
  inquiryId: string;
  travelerName: string;
  listingTitle: string | null;
  operatorName: string | null;
  preferredStartDate: string | null;
  preferredEndDate: string | null;
  notes: string | null;
  confirmedAt: string;
}) {
  try {
    const message = buildBookingConfirmedEmail({
      appUrl: getAppUrl(),
      inquiryId: params.inquiryId,
      travelerName: params.travelerName,
      listingTitle: params.listingTitle,
      operatorName: params.operatorName,
      preferredStartDate: params.preferredStartDate,
      preferredEndDate: params.preferredEndDate,
      notes: params.notes,
      confirmedAt: params.confirmedAt,
      operatorEmail: null,
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build booking confirmation email.",
    };
  }
}

export async function sendBookingReminderEmail(params: {
  to: string;
  inquiryId: string;
  travelerName: string;
  listingTitle: string | null;
  operatorName: string | null;
  preferredStartDate: string | null;
  preferredEndDate: string | null;
  tripDateTime: string | null;
  operatorContact: string | null;
}) {
  try {
    const message = buildBookingReminderEmail({
      appUrl: getAppUrl(),
      inquiryId: params.inquiryId,
      travelerName: params.travelerName,
      listingTitle: params.listingTitle,
      operatorName: params.operatorName,
      preferredStartDate: params.preferredStartDate,
      preferredEndDate: params.preferredEndDate,
      tripDateTime: params.tripDateTime,
      operatorContact: params.operatorContact,
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build booking reminder email.",
    };
  }
}

export async function sendPreTourInstructionsEmail(params: {
  to: string;
  inquiryId: string;
  travelerName: string;
  listingTitle: string | null;
  operatorName: string | null;
  preferredStartDate: string | null;
  preferredEndDate: string | null;
  tripDateTime: string | null;
  meetingPoint: string | null;
  instructions: string | null;
}) {
  try {
    const message = buildPreTourInstructionsEmail({
      appUrl: getAppUrl(),
      inquiryId: params.inquiryId,
      travelerName: params.travelerName,
      listingTitle: params.listingTitle,
      operatorName: params.operatorName,
      preferredStartDate: params.preferredStartDate,
      preferredEndDate: params.preferredEndDate,
      tripDateTime: params.tripDateTime,
      meetingPoint: params.meetingPoint,
      instructions: params.instructions,
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build pre-tour instructions email.",
    };
  }
}

export async function sendPostTourReviewRequestEmail(params: {
  to: string;
  inquiryId: string;
  travelerName: string;
  listingTitle: string | null;
  operatorName: string | null;
  preferredStartDate: string | null;
  preferredEndDate: string | null;
}) {
  try {
    const message = buildPostTourReviewRequestEmail({
      appUrl: getAppUrl(),
      inquiryId: params.inquiryId,
      travelerName: params.travelerName,
      listingTitle: params.listingTitle,
      operatorName: params.operatorName,
      preferredStartDate: params.preferredStartDate,
      preferredEndDate: params.preferredEndDate,
      reviewLink: cleanUrl(`/ConfirmationPage?inquiryId=${encodeURIComponent(params.inquiryId)}`),
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build post-tour review email.",
    };
  }
}

export async function sendOperatorReplyTravelerEmail(params: {
  to: string;
  travelerName?: string | null;
  operatorName: string;
  listingTitle?: string | null;
  inquiryId?: string | null;
  replyMessage: string;
}) {
  try {
    const message = operatorReplyTravelerEmail({
      appUrl: getAppUrl(),
      travelerName: params.travelerName ?? null,
      operatorName: params.operatorName,
      listingTitle: params.listingTitle ?? null,
      inquiryId: params.inquiryId ?? null,
      replyMessage: params.replyMessage,
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build operator reply email.",
    };
  }
}

export async function sendTravelerPaymentSuccessEmail(params: {
  to: string;
  travelerName?: string | null;
  operatorName?: string | null;
  listingTitle?: string | null;
  destination?: string | null;
  inquiryId: string;
  amount?: string | null;
  paidAt?: string | null;
  orderId?: string | null;
}) {
  try {
    const message = travelerPaymentSuccessEmail({
      appUrl: getAppUrl(),
      travelerName: params.travelerName ?? null,
      operatorName: params.operatorName ?? null,
      listingTitle: params.listingTitle ?? null,
      destination: params.destination ?? null,
      inquiryId: params.inquiryId,
      amount: params.amount ?? null,
      paidAt: params.paidAt ?? null,
      orderId: params.orderId ?? null,
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build traveler payment success email.",
    };
  }
}

export async function sendOperatorPaymentReceivedEmail(params: {
  to: string;
  operatorName?: string | null;
  travelerName?: string | null;
  listingTitle?: string | null;
  destination?: string | null;
  inquiryId: string;
  amount?: string | null;
  paidAt?: string | null;
  orderId?: string | null;
  operatorPayoutAmount?: string | null;
  adminCommissionAmount?: string | null;
}) {
  try {
    const message = operatorPaymentReceivedEmail({
      appUrl: getAppUrl(),
      operatorName: params.operatorName ?? null,
      travelerName: params.travelerName ?? null,
      listingTitle: params.listingTitle ?? null,
      destination: params.destination ?? null,
      inquiryId: params.inquiryId,
      amount: params.amount ?? null,
      paidAt: params.paidAt ?? null,
      orderId: params.orderId ?? null,
      operatorPayoutAmount: params.operatorPayoutAmount ?? null,
      adminCommissionAmount: params.adminCommissionAmount ?? null,
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build operator payment email.",
    };
  }
}

export async function sendAdminPaidBookingNotificationEmail(params: {
  to: string;
  travelerName?: string | null;
  operatorName?: string | null;
  listingTitle?: string | null;
  destination?: string | null;
  inquiryId: string;
  amount?: string | null;
  paidAt?: string | null;
  orderId?: string | null;
  operatorPayoutAmount?: string | null;
  adminCommissionAmount?: string | null;
}) {
  try {
    const message = adminPaidBookingNotificationEmail({
      appUrl: getAppUrl(),
      travelerName: params.travelerName ?? null,
      operatorName: params.operatorName ?? null,
      listingTitle: params.listingTitle ?? null,
      destination: params.destination ?? null,
      inquiryId: params.inquiryId,
      amount: params.amount ?? null,
      paidAt: params.paidAt ?? null,
      orderId: params.orderId ?? null,
      operatorPayoutAmount: params.operatorPayoutAmount ?? null,
      adminCommissionAmount: params.adminCommissionAmount ?? null,
    });

    return sendEmail({ to: params.to, ...message });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build admin paid booking email.",
    };
  }
}
