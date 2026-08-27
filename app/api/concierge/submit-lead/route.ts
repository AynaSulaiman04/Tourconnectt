import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseTripIntentFromConversation } from "@/lib/ai/trip-intent";
import { buildConciergeContext } from "@/lib/ai/concierge-context";
import {
  getConciergeConversationById,
  getConciergeConversationMessages,
} from "@/lib/ai/concierge-store";
import {
  embedStructuredLeadInNotes,
  hasStoredLeadData,
  tripIntentToStoredLead,
} from "@/lib/inquiry/structured-lead";
import { sendInquirySubmissionEmailsForInquiryId } from "@/lib/email/workflows";
import { getFeaturedInquiryListings } from "@/lib/supabase/inquiry";
import { ensureConversationForInquiry } from "@/lib/supabase/direct-messages";
import { recordAdminNotifications, recordPlatformNotification } from "@/lib/supabase/notifications";
import { normalizeProfileImageSource } from "@/lib/supabase/profile-image";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization");

  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = header.slice(7).trim();
  return token.length ? token : null;
}

async function getProfileFromBearerToken(request: NextRequest) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return null;
  }

  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !authData.user) {
    return null;
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id,email,full_name,preferred_inquiry_area,role,is_active,status_reason,last_seen_at,created_at,updated_at,avatar_base64,profile_image_url",
    )
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!profile?.is_active) {
    return null;
  }

  return {
    authUser: authData.user,
    profile: {
      ...profile,
      profile_image_url:
        normalizeProfileImageSource(profile.avatar_base64) ??
        normalizeProfileImageSource(profile.profile_image_url) ??
        null,
    } as TravelerProfile,
  };
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    let profileContext = await getOptionalCurrentUserProfile();

    if (!profileContext?.profile) {
      profileContext = await getProfileFromBearerToken(request);
    }

    if (!profileContext?.profile) {
      return NextResponse.json(
        { ok: false, error: "Please sign in to request a personalised quote." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          conversationId?: string | null;
          listingId?: string | null;
        }
      | null;

    const conversationId = body?.conversationId?.trim() ?? "";
    const requestedListingId = body?.listingId?.trim() ?? "";

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "Start a conversation before requesting a quote." },
        { status: 400 },
      );
    }

    const conversation = await getConciergeConversationById(conversationId, profileContext.profile.id);
    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: "We could not find that concierge conversation." },
        { status: 404 },
      );
    }

    const historyMessages = await getConciergeConversationMessages({
      conversationId: conversation.id,
      userId: profileContext.profile.id,
      limit: 20,
    });

    const userMessages = historyMessages
      .filter((message) => message.role === "user")
      .map((message) => message.content.trim())
      .filter(Boolean);

    if (!userMessages.length) {
      return NextResponse.json(
        { ok: false, error: "Describe your trip in chat before requesting a quote." },
        { status: 400 },
      );
    }

    const tripIntent = parseTripIntentFromConversation(
      historyMessages.map((message) => ({ role: message.role, content: message.content })),
    );
    const storedLead = tripIntentToStoredLead(tripIntent);

    if (!hasStoredLeadData(storedLead)) {
      return NextResponse.json(
        { ok: false, error: "Add a few more trip details in chat before requesting a quote." },
        { status: 400 },
      );
    }

    const admin = createSupabaseServiceRoleClient();
    let listingId = requestedListingId;

    if (!listingId) {
      const context = await buildConciergeContext({
        query: tripIntent.rawQuery,
        userId: profileContext.profile.id,
      });
      listingId = context.recommendations[0]?.id ?? "";
    }

    if (!listingId) {
      const featured = await getFeaturedInquiryListings(1);
      listingId = featured[0]?.id ?? "";
    }

    if (!listingId) {
      return NextResponse.json(
        { ok: false, error: "No active experiences are available for enquiries right now." },
        { status: 503 },
      );
    }

    const { data: listing, error: listingError } = await admin
      .from("tour_listings")
      .select("id,title,location,country,operator_id,operator_name")
      .eq("id", listingId)
      .eq("is_active", true)
      .eq("status", "live")
      .maybeSingle();

    if (listingError || !listing?.operator_id) {
      return NextResponse.json(
        { ok: false, error: "That experience is not currently accepting enquiries." },
        { status: 400 },
      );
    }

    const travelerEmail = profileContext.profile.email?.toLowerCase() ?? profileContext.authUser.email?.toLowerCase() ?? "";
    if (!travelerEmail) {
      return NextResponse.json(
        { ok: false, error: "Add an email address to your profile before requesting a quote." },
        { status: 400 },
      );
    }

    const travelerName =
      profileContext.profile.full_name?.trim() ||
      profileContext.authUser.user_metadata?.full_name?.trim() ||
      travelerEmail.split("@")[0];

    const durationDays = tripIntent.durationDays ?? 6;
    const preferredStartDate = addDaysIsoDate(30);
    const preferredEndDate = addDaysIsoDate(30 + durationDays);
    const notes = embedStructuredLeadInNotes(storedLead, tripIntent.rawQuery);

    const duplicateCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentInquiries } = await admin
      .from("inquiries")
      .select("id")
      .eq("listing_id", listing.id)
      .eq("user_id", profileContext.profile.id)
      .gte("created_at", duplicateCutoff)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentInquiries?.[0]?.id) {
      return NextResponse.json({
        ok: true,
        inquiryId: recentInquiries[0].id,
        redirectTo: `/ConfirmationPage?inquiryId=${recentInquiries[0].id}`,
      });
    }

    const { data: inquiry, error: insertError } = await admin
      .from("inquiries")
      .insert({
        user_id: profileContext.profile.id,
        listing_id: listing.id,
        traveler_name: travelerName,
        traveler_email: travelerEmail,
        traveler_phone: null,
        destination: listing.location,
        destination_country: listing.country,
        operator_name: listing.operator_name,
        operator_id: listing.operator_id,
        preferred_start_date: preferredStartDate,
        preferred_end_date: preferredEndDate,
        availability: "flexible",
        notes,
        status: "submitted",
      })
      .select("id")
      .single();

    if (insertError || !inquiry) {
      return NextResponse.json(
        { ok: false, error: insertError?.message ?? "Unable to submit enquiry." },
        { status: 500 },
      );
    }

    await ensureConversationForInquiry({
      travelerId: profileContext.profile.id,
      operatorId: listing.operator_id,
      listingId: listing.id,
      inquiryId: inquiry.id,
    }).catch((conversationError) => {
      console.error("Unable to seed direct conversation for concierge lead", {
        inquiryId: inquiry.id,
        error: conversationError,
      });
    });

    try {
      await recordPlatformNotification({
        recipientProfileId: listing.operator_id,
        actorProfileId: profileContext.profile.id,
        kind: "inquiry_submitted",
        title: "New enquiry received",
        body: `${travelerName} submitted a concierge enquiry for ${listing.title}.`,
        href: `/OperatorMessages?inquiry=${inquiry.id}`,
        entityType: "inquiry",
        entityId: inquiry.id,
        metadata: {
          listingId: listing.id,
          listingTitle: listing.title,
          destination: listing.location,
          source: "concierge",
        },
      });
    } catch (notificationError) {
      console.error("Unable to record concierge inquiry notification", {
        inquiryId: inquiry.id,
        error: notificationError,
      });
    }

    await recordAdminNotifications({
      actorProfileId: profileContext.profile.id,
      kind: "inquiry_submitted",
      title: "New concierge enquiry submitted",
      body: `${travelerName} submitted a structured enquiry from Concierge for ${listing.title}.`,
      href: `/AdminBookings?inquiry=${inquiry.id}`,
      entityType: "inquiry",
      entityId: inquiry.id,
      metadata: {
        listingId: listing.id,
        listingTitle: listing.title,
        source: "concierge",
      },
    }).catch((notificationError) => {
      console.error("Unable to record admin concierge inquiry notification", {
        inquiryId: inquiry.id,
        error: notificationError,
      });
    });

    await sendInquirySubmissionEmailsForInquiryId(inquiry.id).catch((emailError) => {
      console.error("Unable to send concierge inquiry emails", {
        inquiryId: inquiry.id,
        error: emailError,
      });
    });

    return NextResponse.json({
      ok: true,
      inquiryId: inquiry.id,
      redirectTo: `/ConfirmationPage?inquiryId=${inquiry.id}`,
    });
  } catch (error) {
    console.error("Concierge submit-lead error", error);
    return NextResponse.json(
      { ok: false, error: "We could not submit your enquiry right now. Please try again shortly." },
      { status: 500 },
    );
  }
}
