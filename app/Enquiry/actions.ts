"use server";

import { createHmac } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { recordPlatformEvent, getReferralCampaignByCode } from "@/lib/supabase/analytics";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendInquirySubmissionEmailsForInquiryId } from "@/lib/email/workflows";
import { recordAdminNotifications, recordPlatformNotification } from "@/lib/supabase/notifications";
import { ensureConversationForInquiry } from "@/lib/supabase/direct-messages";
import { parseTripIntent } from "@/lib/ai/trip-intent";
import {
  embedStructuredLeadInNotes,
  hasStoredLeadData,
  tripIntentToStoredLead,
} from "@/lib/inquiry/structured-lead";
import { initialInquiryFormState, type InquiryFormState } from "./types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INQUIRY_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_INQUIRIES_PER_EMAIL = 3;
const MAX_INQUIRIES_PER_FINGERPRINT = 10;

function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function buildStructuredNotes(displayNotes: string | null | undefined) {
  const trimmed = displayNotes?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const storedLead = tripIntentToStoredLead(parseTripIntent(trimmed));
  if (!hasStoredLeadData(storedLead)) {
    return trimmed;
  }

  return embedStructuredLeadInNotes(storedLead, trimmed);
}

async function getInquirySubmissionFingerprint(travelerEmail: string) {
  const requestHeaders = await headers();
  const forwardedAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address =
    requestHeaders.get("cf-connecting-ip")?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    forwardedAddress ||
    `email:${travelerEmail}`;
  const secret = process.env.INQUIRY_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    return null;
  }

  return createHmac("sha256", secret)
    .update(`inquiry:${address.toLowerCase()}`)
    .digest("hex");
}

const inquirySchema = z
  .object({
    listingId: z.string().uuid({ error: "Choose a listing." }),
    travelerName: z.string({ error: "Enter your name." }).trim().min(2, { error: "Enter your name." }),
    travelerEmail: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : ""),
      z
        .string()
        .min(1, { error: "Enter your email address." })
        .max(320, { error: "Enter a valid email address." })
        .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
          error: "Enter a valid email address.",
        })
        .transform((value) => value.toLowerCase()),
    ),
    travelerPhone: z.string().trim().max(32).optional().or(z.literal("")),
    preferredStartDate: z
      .string({ error: "Choose a start date." })
      .trim()
      .refine(isValidIsoDate, { error: "Choose a valid start date." }),
    preferredEndDate: z
      .string({ error: "Choose an end date." })
      .trim()
      .refine(isValidIsoDate, { error: "Choose a valid end date." }),
    availability: z.enum(["morning", "afternoon", "evening", "flexible"], {
      error: "Choose an availability option.",
    }),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    referralCode: z.string().trim().max(120).optional().or(z.literal("")),
    utmSource: z.string().trim().max(120).optional().or(z.literal("")),
    utmMedium: z.string().trim().max(120).optional().or(z.literal("")),
    utmCampaign: z.string().trim().max(120).optional().or(z.literal("")),
    utmContent: z.string().trim().max(120).optional().or(z.literal("")),
    utmTerm: z.string().trim().max(120).optional().or(z.literal("")),
  })
  .superRefine((values, context) => {
    if (!isValidIsoDate(values.preferredStartDate) || !isValidIsoDate(values.preferredEndDate)) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (values.preferredStartDate < today) {
      context.addIssue({
        code: "custom",
        path: ["preferredStartDate"],
        message: "Choose a start date that is today or later.",
      });
    }

    if (values.preferredEndDate < values.preferredStartDate) {
      context.addIssue({
        code: "custom",
        path: ["preferredEndDate"],
        message: "The end date must be on or after the start date.",
      });
    }
  });

export async function createInquiryAction(
  _state: InquiryFormState,
  formData: FormData,
): Promise<InquiryFormState> {
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim()) {
    return {
      ...initialInquiryFormState,
      message: "We could not submit that request. Please refresh and try again.",
      fieldErrors: {},
    };
  }

  const validatedFields = inquirySchema.safeParse({
    listingId: formData.get("listing_id"),
    travelerName: formData.get("traveler_name"),
    travelerEmail: formData.get("traveler_email"),
    travelerPhone: formData.get("traveler_phone"),
    preferredStartDate: formData.get("preferred_start_date"),
    preferredEndDate: formData.get("preferred_end_date"),
    availability: formData.get("availability"),
    notes: formData.get("notes"),
    referralCode: formData.get("referral_code"),
    utmSource: formData.get("utm_source"),
    utmMedium: formData.get("utm_medium"),
    utmCampaign: formData.get("utm_campaign"),
    utmContent: formData.get("utm_content"),
    utmTerm: formData.get("utm_term"),
  });

  if (!validatedFields.success) {
    return {
      ...initialInquiryFormState,
      message: "Please review the highlighted fields.",
      fieldErrors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const admin = createSupabaseServiceRoleClient();

  const { data: listing, error: listingError } = await admin
    .from("tour_listings")
    .select("id,title,location,country,duration,summary,image_url,price,operator_id,operator_name,featured,is_active,created_at,updated_at")
    .eq("id", validatedFields.data.listingId)
    .eq("is_active", true)
    .eq("status", "live")
    .maybeSingle();

  if (listingError || !listing || !listing.operator_id) {
    return {
      ...initialInquiryFormState,
      message: "That experience is not currently accepting enquiries.",
      fieldErrors: {
        listingId: ["Choose an active experience."],
      },
    };
  }

  const { data: operatorProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", listing.operator_id)
    .eq("role", "operator")
    .eq("is_active", true)
    .maybeSingle();

  if (!operatorProfile) {
    return {
      ...initialInquiryFormState,
      message: "That experience is not currently accepting enquiries.",
      fieldErrors: {
        listingId: ["Choose an active experience."],
      },
    };
  }

  const userName = authData.user?.user_metadata?.full_name;
  const userEmail = authData.user?.email;
  const resolvedOperatorId = operatorProfile.id;
  const travelerEmail = (validatedFields.data.travelerEmail || userEmail || "").toLowerCase();
  const duplicateCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  let recentInquiryQuery = admin
    .from("inquiries")
    .select("id")
    .eq("listing_id", listing.id)
    .gte("created_at", duplicateCutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  recentInquiryQuery = authData.user?.id
    ? recentInquiryQuery.eq("user_id", authData.user.id)
    : recentInquiryQuery.eq("traveler_email", travelerEmail);

  const { data: recentInquiries } = await recentInquiryQuery;
  if (recentInquiries?.[0]?.id) {
    redirect(`/ConfirmationPage?inquiryId=${recentInquiries[0].id}`);
  }

  const submissionFingerprint = await getInquirySubmissionFingerprint(travelerEmail);
  const rateLimitCutoff = new Date(Date.now() - INQUIRY_RATE_LIMIT_WINDOW_MS).toISOString();
  const emailRateQuery = admin
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("traveler_email", travelerEmail)
    .gte("created_at", rateLimitCutoff);
  const fingerprintRateQuery = submissionFingerprint
    ? admin
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("submission_fingerprint", submissionFingerprint)
        .gte("created_at", rateLimitCutoff)
    : null;

  const [emailRateResult, fingerprintRateResult] = await Promise.all([
    emailRateQuery,
    fingerprintRateQuery,
  ]);

  if (emailRateResult.error || fingerprintRateResult?.error) {
    console.error("Unable to check inquiry submission rate", {
      emailCode: emailRateResult.error?.code,
      fingerprintCode: fingerprintRateResult?.error?.code,
    });
    return {
      ...initialInquiryFormState,
      message: "We could not submit your request right now. Please try again shortly.",
      fieldErrors: {},
    };
  }

  if (
    (emailRateResult.count ?? 0) >= MAX_INQUIRIES_PER_EMAIL ||
    (fingerprintRateResult?.count ?? 0) >= MAX_INQUIRIES_PER_FINGERPRINT
  ) {
    return {
      ...initialInquiryFormState,
      message: "You have sent several requests recently. Please wait an hour before trying again.",
      fieldErrors: {},
    };
  }

  const { data: inquiry, error } = await admin
    .from("inquiries")
    .insert({
      user_id: authData.user?.id ?? null,
      listing_id: listing.id,
      traveler_name: validatedFields.data.travelerName || userName || "",
      traveler_email: travelerEmail,
      traveler_phone: validatedFields.data.travelerPhone || null,
      destination: listing.location,
      destination_country: listing.country,
      operator_name: listing.operator_name,
      operator_id: resolvedOperatorId,
      preferred_start_date: validatedFields.data.preferredStartDate,
      preferred_end_date: validatedFields.data.preferredEndDate,
      availability: validatedFields.data.availability,
      notes: buildStructuredNotes(validatedFields.data.notes) || null,
      status: "submitted",
      referral_code: validatedFields.data.referralCode || null,
      utm_source: validatedFields.data.utmSource || null,
      utm_medium: validatedFields.data.utmMedium || null,
      utm_campaign: validatedFields.data.utmCampaign || null,
      utm_content: validatedFields.data.utmContent || null,
      utm_term: validatedFields.data.utmTerm || null,
      submission_fingerprint: submissionFingerprint,
    })
    .select("id")
    .single();

  if (error || !inquiry) {
    return {
      ...initialInquiryFormState,
      message: error?.message ?? "Unable to submit enquiry.",
      fieldErrors: {},
    };
  }

  if (resolvedOperatorId) {
    await ensureConversationForInquiry({
      travelerId: authData.user?.id ?? null,
      operatorId: resolvedOperatorId,
      listingId: listing.id,
      inquiryId: inquiry.id,
    }).catch((conversationError) => {
      console.error("Unable to seed direct conversation for inquiry", {
        inquiryId: inquiry.id,
        operatorId: resolvedOperatorId,
        error: conversationError,
      });
    });

    try {
      await recordPlatformNotification({
        recipientProfileId: resolvedOperatorId,
        actorProfileId: authData.user?.id ?? null,
        kind: "inquiry_submitted",
        title: "New enquiry received",
        body: `${validatedFields.data.travelerName} submitted an enquiry for ${listing.title}.`,
        href: `/OperatorMessages?inquiry=${inquiry.id}`,
        entityType: "inquiry",
        entityId: inquiry.id,
        metadata: {
          listingId: listing.id,
          listingTitle: listing.title,
          destination: listing.location,
        },
      });
    } catch (notificationError) {
      console.error("Unable to record inquiry notification", {
        inquiryId: inquiry.id,
        operatorId: resolvedOperatorId,
        error: notificationError,
      });
    }

    await recordAdminNotifications({
      actorProfileId: authData.user?.id ?? null,
      kind: "inquiry_submitted",
      title: "New enquiry submitted",
        body: `${validatedFields.data.travelerName} submitted an enquiry for ${listing.title}.`,
        href: `/AdminBookings?inquiry=${inquiry.id}`,
        entityType: "inquiry",
        entityId: inquiry.id,
        metadata: {
          listingId: listing.id,
          listingTitle: listing.title,
          destination: listing.location,
          operatorId: resolvedOperatorId,
        },
      }).catch((notificationError) => {
        console.error("Unable to record admin inquiry notification", {
        inquiryId: inquiry.id,
        error: notificationError,
      });
    });
  }

  const referralCampaign =
    validatedFields.data.referralCode ? await getReferralCampaignByCode(validatedFields.data.referralCode) : null;

  if (referralCampaign) {
    await recordPlatformEvent({
      event_type: "inquiry_submitted",
      actor_profile_id: authData.user?.id ?? null,
      actor_role: "traveler",
      inquiry_id: inquiry.id,
      referral_campaign_id: referralCampaign.id,
      metadata: {
        referralCode: referralCampaign.code,
        utmSource: validatedFields.data.utmSource || referralCampaign.utm_source,
        utmMedium: validatedFields.data.utmMedium || referralCampaign.utm_medium,
        utmCampaign: validatedFields.data.utmCampaign || referralCampaign.utm_campaign,
      },
    });
  } else {
    await recordPlatformEvent({
      event_type: "inquiry_submitted",
      actor_profile_id: authData.user?.id ?? null,
      actor_role: "traveler",
      inquiry_id: inquiry.id,
      metadata: {
        referralCode: validatedFields.data.referralCode || null,
        utmSource: validatedFields.data.utmSource || null,
        utmMedium: validatedFields.data.utmMedium || null,
        utmCampaign: validatedFields.data.utmCampaign || null,
        utmContent: validatedFields.data.utmContent || null,
        utmTerm: validatedFields.data.utmTerm || null,
      },
    });
  }

  const emailResult = await sendInquirySubmissionEmailsForInquiryId(inquiry.id);
  if (!emailResult.ok) {
    console.error("Inquiry submission email workflow warning", {
      inquiryId: inquiry.id,
      error: emailResult.error,
    });
  }

  revalidatePath("/Enquiry");
  revalidatePath("/ConfirmationPage");
  revalidatePath("/TravellerProfile");
  revalidatePath("/OperatorDashboard");
  revalidatePath("/OperatorBookings");
  revalidatePath("/OperatorMessages");
  revalidatePath("/AdminDashboard");
  revalidatePath("/AdminBookings");
  revalidatePath("/AdminAnalytics");

  redirect(`/ConfirmationPage?inquiryId=${inquiry.id}`);
}
