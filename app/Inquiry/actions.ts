"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordPlatformEvent, getReferralCampaignByCode } from "@/lib/supabase/analytics";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendInquirySubmissionEmailsForInquiryId } from "@/lib/email/workflows";
import { recordAdminNotifications, recordPlatformNotification } from "@/lib/supabase/notifications";
import { ensureConversationForInquiry } from "@/lib/supabase/direct-messages";
import { resolveOperatorProfileId } from "@/lib/supabase/operator-resolution";
import { initialInquiryFormState, type InquiryFormState } from "./types";

const inquirySchema = z.object({
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
      }),
  ),
  travelerPhone: z.string().trim().max(32).optional().or(z.literal("")),
  preferredStartDate: z.string({ error: "Choose a start date." }).trim().min(1, { error: "Choose a start date." }),
  preferredEndDate: z.string({ error: "Choose an end date." }).trim().min(1, { error: "Choose an end date." }),
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
});

export async function createInquiryAction(
  _state: InquiryFormState,
  formData: FormData,
): Promise<InquiryFormState> {
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
    .maybeSingle();

  if (listingError || !listing) {
    return {
      ...initialInquiryFormState,
      message: "Choose a valid listing.",
      fieldErrors: {
        listingId: ["Choose a valid listing."],
      },
    };
  }

  const userName = authData.user?.user_metadata?.full_name;
  const userEmail = authData.user?.email;
  const resolvedOperatorId =
    listing.operator_id ?? (await resolveOperatorProfileId(admin, [listing.operator_name, listing.title]).catch(() => null));

  const { data: inquiry, error } = await admin
    .from("inquiries")
    .insert({
      user_id: authData.user?.id ?? null,
      listing_id: listing.id,
      traveler_name: validatedFields.data.travelerName || userName || "",
      traveler_email: validatedFields.data.travelerEmail || userEmail || "",
      traveler_phone: validatedFields.data.travelerPhone || null,
      destination: listing.location,
      destination_country: listing.country,
      operator_name: listing.operator_name,
      operator_id: resolvedOperatorId,
      preferred_start_date: validatedFields.data.preferredStartDate,
      preferred_end_date: validatedFields.data.preferredEndDate,
      availability: validatedFields.data.availability,
      notes: validatedFields.data.notes || null,
      status: "submitted",
      referral_code: validatedFields.data.referralCode || null,
      utm_source: validatedFields.data.utmSource || null,
      utm_medium: validatedFields.data.utmMedium || null,
      utm_campaign: validatedFields.data.utmCampaign || null,
      utm_content: validatedFields.data.utmContent || null,
      utm_term: validatedFields.data.utmTerm || null,
    })
    .select("id")
    .single();

  if (error || !inquiry) {
    return {
      ...initialInquiryFormState,
      message: error?.message ?? "Unable to submit inquiry.",
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
        title: "New inquiry received",
        body: `${validatedFields.data.travelerName} submitted an inquiry for ${listing.title}.`,
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
      title: "New inquiry submitted",
        body: `${validatedFields.data.travelerName} submitted an inquiry for ${listing.title}.`,
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

  revalidatePath("/Inquiry");
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
