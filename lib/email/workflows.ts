import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { calculatePaymentSettlement } from "@/lib/payments/wipay";
import {
  sendAdminPaidBookingNotificationEmail,
  sendBookingConfirmedEmail,
  sendInquiryConfirmationEmail,
  sendOperatorPaymentReceivedEmail,
  sendOperatorReplyTravelerEmail,
  sendOperatorInquiryNotificationEmail,
  sendTravelerPaymentSuccessEmail,
} from "./mailer";

type InquiryRow = {
  id: string;
  user_id: string | null;
  listing_id: string | null;
  traveler_name: string;
  traveler_email: string;
  traveler_phone: string | null;
  destination: string;
  destination_country: string;
  operator_name: string;
  operator_id: string | null;
  preferred_start_date: string | null;
  preferred_end_date: string | null;
  availability: "morning" | "afternoon" | "evening" | "flexible";
  notes: string | null;
  status: "submitted" | "reviewed" | "confirmed" | "closed";
  confirmation_email_sent_at: string | null;
  operator_notification_email_sent_at: string | null;
  created_at: string;
};

type ListingRow = {
  id: string;
  title: string;
  operator_id: string | null;
  operator_name: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "traveler" | "operator" | "admin";
};

type InquiryEmailContext = {
  inquiry: InquiryRow;
  listing: ListingRow | null;
  operatorProfile: ProfileRow | null;
};

type ConversationEmailContext = {
  inquiryId: string | null;
  travelerName: string | null;
  travelerEmail: string | null;
  operatorName: string | null;
  operatorEmail: string | null;
  listingTitle: string | null;
};

function isMissingRelationError(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "42P01" || error?.message?.includes("Could not find the table");
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "42703" || error?.message?.includes("column") && error.message.includes("does not exist");
}

async function loadInquiryContext(inquiryId: string): Promise<InquiryEmailContext | null> {
  const admin = createSupabaseServiceRoleClient();

  async function fetchInquiry() {
    return admin
      .from("inquiries")
      .select(
        "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,confirmation_email_sent_at,operator_notification_email_sent_at,created_at",
      )
      .eq("id", inquiryId)
      .maybeSingle();
  }

  let inquiryResult = await fetchInquiry();

  if (inquiryResult.error && isMissingColumnError(inquiryResult.error)) {
    inquiryResult = await admin
      .from("inquiries")
      .select(
        "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,created_at",
      )
      .eq("id", inquiryId)
      .maybeSingle();
  }

  const { data: inquiry, error: inquiryError } = inquiryResult;

  if (inquiryError || !inquiry) {
    if (inquiryError && (isMissingRelationError(inquiryError) || isMissingColumnError(inquiryError))) {
      return null;
    }

    throw new Error(inquiryError?.message ?? "Unable to load inquiry.");
  }

  let listing: ListingRow | null = null;

  if (inquiry.listing_id) {
    const { data: listingData, error: listingError } = await admin
      .from("tour_listings")
      .select("id,title,operator_id,operator_name")
      .eq("id", inquiry.listing_id)
      .maybeSingle();

    if (listingError) {
      if (isMissingRelationError(listingError)) {
        listing = null;
      } else {
        throw new Error(listingError.message);
      }
    } else {
      listing = (listingData ?? null) as ListingRow | null;
    }
  }

  const operatorId = inquiry.operator_id ?? listing?.operator_id ?? null;
  let operatorProfile: ProfileRow | null = null;

  if (operatorId) {
    const { data: profileData, error: profileError } = await admin
      .from("profiles")
      .select("id,email,full_name,role")
      .eq("id", operatorId)
      .maybeSingle();

    if (profileError) {
      if (isMissingRelationError(profileError)) {
        operatorProfile = null;
      } else {
        throw new Error(profileError.message);
      }
    } else {
      operatorProfile = (profileData ?? null) as ProfileRow | null;
    }
  }

  return {
    inquiry: inquiry as InquiryRow,
    listing,
    operatorProfile,
  };
}

async function markInquiryEmailSent(
  inquiryId: string,
  column: "confirmation_email_sent_at" | "operator_notification_email_sent_at",
) {
  const admin = createSupabaseServiceRoleClient();
  const { data: columnInfo, error: columnError } = await admin
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "inquiries")
    .eq("column_name", column)
    .maybeSingle();

  if (columnError && !isMissingRelationError(columnError)) {
    throw new Error(columnError.message);
  }

  if (!columnInfo) {
    return;
  }

  const { error } = await admin.from("inquiries").update({ [column]: new Date().toISOString() }).eq("id", inquiryId);

  if (error) {
    if (isMissingColumnError(error)) {
      return;
    }
    throw new Error(error.message);
  }
}

function buildDisplayName(primary: string | null | undefined, fallback: string) {
  return primary && primary.trim().length > 0 ? primary.trim() : fallback;
}

function normalizeEmail(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

async function safeSend<T extends { ok: boolean; error?: string }>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to send email.",
    } as T;
  }
}

async function loadConversationEmailContext(conversationId: string): Promise<ConversationEmailContext | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: conversation, error: conversationError } = await admin
    .from("traveler_operator_conversations")
    .select("id,traveler_id,operator_id,listing_id,inquiry_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    if (conversationError && isMissingRelationError(conversationError)) {
      return null;
    }

    throw new Error(conversationError?.message ?? "Unable to load conversation.");
  }

  if (conversation.inquiry_id) {
    const inquiryContext = await loadInquiryContext(conversation.inquiry_id);
    if (!inquiryContext) {
      return null;
    }

    return {
      inquiryId: inquiryContext.inquiry.id,
      travelerName: inquiryContext.inquiry.traveler_name,
      travelerEmail: inquiryContext.inquiry.traveler_email,
      operatorName:
        inquiryContext.operatorProfile?.full_name ??
        inquiryContext.listing?.operator_name ??
        inquiryContext.inquiry.operator_name,
      operatorEmail: inquiryContext.operatorProfile?.email ?? null,
      listingTitle: inquiryContext.listing?.title ?? inquiryContext.inquiry.destination,
    };
  }

  const profileIds = [conversation.traveler_id, conversation.operator_id].filter((value): value is string => Boolean(value));
  const [profilesResult, listingResult] = await Promise.all([
    profileIds.length
      ? admin.from("profiles").select("id,email,full_name,role").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    conversation.listing_id
      ? admin.from("tour_listings").select("id,title,operator_name").eq("id", conversation.listing_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (profilesResult.error && !isMissingRelationError(profilesResult.error)) {
    throw new Error(profilesResult.error.message);
  }

  if (listingResult.error && !isMissingRelationError(listingResult.error)) {
    throw new Error(listingResult.error.message);
  }

  const profilesById = new Map(
    (((profilesResult.data ?? []) as ProfileRow[])).map((profile) => [profile.id, profile]),
  );
  const travelerProfile = profilesById.get(conversation.traveler_id);
  const operatorProfile = profilesById.get(conversation.operator_id);
  const listing = (listingResult.data ?? null) as ListingRow | null;

  return {
    inquiryId: null,
    travelerName: travelerProfile?.full_name ?? "Traveler",
    travelerEmail: travelerProfile?.email ?? null,
    operatorName: operatorProfile?.full_name ?? listing?.operator_name ?? "Operator",
    operatorEmail: operatorProfile?.email ?? null,
    listingTitle: listing?.title ?? null,
  };
}

export async function sendInquirySubmissionEmailsForInquiryId(inquiryId: string) {
  const context = await loadInquiryContext(inquiryId);

  if (!context) {
    return { ok: false, error: "Inquiry context was not found." };
  }

  const listingTitle = context.listing?.title ?? context.inquiry.destination;
  const operatorName = context.operatorProfile?.full_name ?? context.listing?.operator_name ?? context.inquiry.operator_name;
  const travelerName = buildDisplayName(context.inquiry.traveler_name, "Traveler");
  const travelerEmail = context.inquiry.traveler_email;
  const travelerPhone = context.inquiry.traveler_phone;
  const preferredStartDate = context.inquiry.preferred_start_date;
  const preferredEndDate = context.inquiry.preferred_end_date;
  const availability = context.inquiry.availability;
  const notes = context.inquiry.notes;
  const destination = context.inquiry.destination;
  const operatorEmail = context.operatorProfile?.email ?? null;

  const [travelerResult, operatorResult] = await Promise.all([
    context.inquiry.confirmation_email_sent_at || !travelerEmail
      ? Promise.resolve({ ok: true as const, skipped: true as const })
      : safeSend(() =>
          sendInquiryConfirmationEmail({
            to: travelerEmail,
            inquiryId,
            submittedAt: context.inquiry.created_at,
            travelerName,
            travelerEmail,
            travelerPhone,
            listingTitle,
            operatorName,
            preferredStartDate,
            preferredEndDate,
            availability,
            notes,
            destination,
          }),
        ),
    context.inquiry.operator_notification_email_sent_at || !operatorEmail
      ? Promise.resolve({ ok: true as const, skipped: true as const })
      : safeSend(() =>
          sendOperatorInquiryNotificationEmail({
            to: operatorEmail,
            inquiryId,
            travelerName,
            travelerEmail,
            travelerPhone,
            listingTitle,
            operatorName,
            preferredStartDate,
            preferredEndDate,
            availability,
            notes,
            destination,
          }),
        ),
  ]);

  let travelerEmailSent = false;
  let operatorEmailSent = false;
  const errors: string[] = [];

  if (travelerResult.ok && !("skipped" in travelerResult)) {
    travelerEmailSent = true;
  } else if (!travelerResult.ok && !("skipped" in travelerResult)) {
    errors.push(travelerResult.error ?? "Traveler email failed.");
  }

  if (operatorResult.ok && !("skipped" in operatorResult)) {
    operatorEmailSent = true;
  } else if (!operatorResult.ok && !("skipped" in operatorResult)) {
    errors.push(operatorResult.error ?? "Operator email failed.");
  }

  try {
    if (travelerEmailSent) {
      await markInquiryEmailSent(inquiryId, "confirmation_email_sent_at");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Unable to record traveler email timestamp.");
  }

  try {
    if (operatorEmailSent) {
      await markInquiryEmailSent(inquiryId, "operator_notification_email_sent_at");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Unable to record operator email timestamp.");
  }

  if (errors.length > 0) {
    console.error("Inquiry email workflow finished with warnings", {
      inquiryId,
      errors,
    });
    return {
      ok: false,
      error: errors.join(" | "),
    };
  }

  return {
    ok: true,
  };
}

export async function sendBookingConfirmationEmailForInquiryId(inquiryId: string) {
  const context = await loadInquiryContext(inquiryId);

  if (!context) {
    return { ok: false, error: "Inquiry context was not found." };
  }

  if (context.inquiry.confirmation_email_sent_at || !context.inquiry.traveler_email) {
    return { ok: true, skipped: true };
  }

  const listingTitle = context.listing?.title ?? context.inquiry.destination;
  const operatorName = context.operatorProfile?.full_name ?? context.listing?.operator_name ?? context.inquiry.operator_name;
  const result = await safeSend(() =>
    sendBookingConfirmedEmail({
      to: context.inquiry.traveler_email,
      inquiryId,
      travelerName: buildDisplayName(context.inquiry.traveler_name, "Traveler"),
      listingTitle,
      operatorName,
      preferredStartDate: context.inquiry.preferred_start_date,
      preferredEndDate: context.inquiry.preferred_end_date,
      notes: context.inquiry.notes,
      confirmedAt: new Date().toISOString(),
    }),
  );

  if (!result.ok) {
    return result;
  }

  try {
    await markInquiryEmailSent(inquiryId, "confirmation_email_sent_at");
  } catch (error) {
    console.error("Failed to record booking confirmation timestamp", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to record confirmation email timestamp.",
    };
  }

  return result;
}

export async function sendOperatorReplyNotificationForConversation(conversationId: string, replyMessage: string) {
  const context = await loadConversationEmailContext(conversationId);

  if (!context) {
    return { ok: false, error: "Conversation email context was not found." };
  }

  if (!context.travelerEmail) {
    return { ok: true, skipped: true };
  }

  const travelerEmail = context.travelerEmail;

  return safeSend(() =>
    sendOperatorReplyTravelerEmail({
      to: travelerEmail,
      travelerName: context.travelerName,
      operatorName: buildDisplayName(context.operatorName, "Operator"),
      listingTitle: context.listingTitle,
      inquiryId: context.inquiryId,
      replyMessage,
    }),
  );
}

export async function sendPaidBookingEmailsForInquiry(params: {
  inquiryId: string;
  orderId?: string | null;
  amount?: string | null;
  paidAt?: string | null;
}) {
  const context = await loadInquiryContext(params.inquiryId);

  if (!context) {
    return { ok: false, error: "Inquiry payment email context was not found." };
  }

  const listingTitle = context.listing?.title ?? context.inquiry.destination;
  const operatorName =
    context.operatorProfile?.full_name ?? context.listing?.operator_name ?? context.inquiry.operator_name;
  const travelerName = buildDisplayName(context.inquiry.traveler_name, "Traveler");
  const travelerEmail = normalizeEmail(context.inquiry.traveler_email);
  const operatorEmail = normalizeEmail(context.operatorProfile?.email);
  const appAdminEmail = normalizeEmail(process.env.ADMIN_NOTIFICATION_EMAIL);
  const settlement = calculatePaymentSettlement(params.amount);
  const operatorPayoutAmount = settlement ? settlement.operatorPayoutAmount.toFixed(2) : null;
  const adminCommissionAmount = settlement ? settlement.adminCommissionAmount.toFixed(2) : null;

  const admin = createSupabaseServiceRoleClient();
  const { data: adminProfiles, error: adminProfilesError } = await admin
    .from("profiles")
    .select("email,role")
    .eq("role", "admin");

  if (adminProfilesError && !isMissingRelationError(adminProfilesError)) {
    throw new Error(adminProfilesError.message);
  }

  const adminEmails = [
    appAdminEmail,
    ...(((adminProfiles ?? []) as Array<{ email: string | null; role: "admin" }>).map((profile) => normalizeEmail(profile.email))),
  ].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);

  const tasks: Array<Promise<{ ok: boolean; error?: string; skipped?: true }>> = [
    travelerEmail
      ? safeSend(() =>
          sendTravelerPaymentSuccessEmail({
            to: travelerEmail,
            travelerName,
            operatorName,
            listingTitle,
            destination: context.inquiry.destination,
            inquiryId: params.inquiryId,
            amount: params.amount,
            paidAt: params.paidAt,
            orderId: params.orderId,
          }),
        )
      : Promise.resolve({ ok: true, skipped: true }),
    operatorEmail
      ? safeSend(() =>
          sendOperatorPaymentReceivedEmail({
            to: operatorEmail,
            operatorName,
            travelerName,
            listingTitle,
            destination: context.inquiry.destination,
            inquiryId: params.inquiryId,
            amount: params.amount,
            paidAt: params.paidAt,
            orderId: params.orderId,
            operatorPayoutAmount,
            adminCommissionAmount,
          }),
        )
      : Promise.resolve({ ok: true, skipped: true }),
    ...adminEmails.map((email) =>
      safeSend(() =>
        sendAdminPaidBookingNotificationEmail({
          to: email,
          travelerName,
          operatorName,
          listingTitle,
          destination: context.inquiry.destination,
          inquiryId: params.inquiryId,
          amount: params.amount,
          paidAt: params.paidAt,
          orderId: params.orderId,
          operatorPayoutAmount,
          adminCommissionAmount,
        }),
      ),
    ),
  ];

  const results = await Promise.all(tasks);
  const errors = results
    .filter((result) => !result.ok)
    .map((result) => result.error ?? "Unable to send payment email.");

  if (errors.length) {
    console.error("Paid booking email workflow finished with warnings", {
      inquiryId: params.inquiryId,
      errors,
    });
    return {
      ok: false,
      error: errors.join(" | "),
    };
  }

  return { ok: true };
}
