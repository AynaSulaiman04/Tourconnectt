import "server-only";

import { sendOperatorReplyNotificationForConversation } from "@/lib/email/workflows";
import { createSupabaseServiceRoleClient } from "./server";
import { normalizeProfileImageSource } from "./profile-image";
import { recordAdminNotifications, recordPlatformNotification } from "./notifications";
import type { TravelerInquiry } from "./inquiry-types";
import type { TravelerProfile } from "./profile-types";

type DirectSenderRole = "traveler" | "operator";

export type DirectConversationRecord = {
  id: string;
  traveler_id: string | null;
  operator_id: string;
  listing_id: string | null;
  inquiry_id: string | null;
  status: "open" | "closed";
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DirectMessageRecord = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: DirectSenderRole;
  message: string;
  read_at: string | null;
  created_at: string;
};

type ProfileSummary = {
  id: string;
  full_name: string;
  email: string | null;
  role: TravelerProfile["role"];
  profile_image_url: string | null;
};

type LaunchContext = {
  listingId: string | null;
  inquiryId: string | null;
  operatorId: string | null;
  operatorName: string | null;
  listingTitle: string | null;
  listingLocation: string | null;
  datesLabel: string | null;
  inquiryStatus: TravelerInquiry["status"] | null;
  travelerName: string | null;
  travelerId: string | null;
};

export type DirectConversationSummary = DirectConversationRecord & {
  traveler_name: string;
  traveler_email: string | null;
  traveler_image_url: string | null;
  operator_name: string;
  operator_email: string | null;
  operator_image_url: string | null;
  listing_title: string | null;
  listing_location: string | null;
  inquiry_destination: string | null;
  inquiry_status: TravelerInquiry["status"] | null;
  last_message_preview: string | null;
  last_sender_role: DirectSenderRole | null;
  unread_count: number;
  title: string;
  subtitle: string;
  counterpart_name: string;
  launch_href: string | null;
};

export type DirectMessagePageState = {
  conversations: DirectConversationSummary[];
  activeConversation: DirectConversationSummary | null;
  messages: DirectMessageRecord[];
  context: LaunchContext | null;
};

export type DirectMessageRouteRole = "traveler" | "operator";

const CONVERSATION_COLUMNS =
  "id,traveler_id,operator_id,listing_id,inquiry_id,status,last_message_at,created_at,updated_at";
const MESSAGE_COLUMNS = "id,conversation_id,sender_id,sender_role,message,read_at,created_at";
const PROFILE_COLUMNS = "id,full_name,email,role,avatar_base64,profile_image_url";
const LISTING_COLUMNS = "id,title,location,operator_id,operator_name";
const INQUIRY_COLUMNS =
  "id,user_id,listing_id,traveler_name,traveler_email,operator_id,operator_name,destination,destination_country,status,created_at,updated_at";
const FALLBACK_CHAT_PREFIX = "__operator_chat__:";
const FALLBACK_CHAT_VERSION = "v2";

type FallbackConversationMeta = {
  travelerId: string;
  operatorId: string;
  listingId: string | null;
  inquiryId: string | null;
};

type FallbackConciergeConversation = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type FallbackConciergeMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: unknown[] | null;
  created_at: string;
};

type InboxInquiryRow = Pick<
  TravelerInquiry,
  | "id"
  | "user_id"
  | "listing_id"
  | "traveler_name"
  | "traveler_email"
  | "operator_id"
  | "operator_name"
  | "destination"
  | "destination_country"
  | "status"
  | "notes"
  | "created_at"
  | "updated_at"
>;

function encodeFallbackConversationTitle(meta: Omit<FallbackConversationMeta, "travelerId"> & { travelerId?: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      travelerId: meta.travelerId ?? "",
      operatorId: meta.operatorId,
      listingId: meta.listingId,
      inquiryId: meta.inquiryId,
    }),
    "utf8",
  ).toString("base64url");

  return `${FALLBACK_CHAT_PREFIX}${FALLBACK_CHAT_VERSION}:${meta.operatorId}:${payload}`;
}

function decodeFallbackConversationTitle(title: string | null) {
  if (!title?.startsWith(FALLBACK_CHAT_PREFIX)) {
    return null;
  }

  try {
    const encodedValue = title.slice(FALLBACK_CHAT_PREFIX.length);
    const versionedPrefix = `${FALLBACK_CHAT_VERSION}:`;
    const versionedParts = encodedValue.startsWith(versionedPrefix)
      ? encodedValue.slice(versionedPrefix.length).split(":", 2)
      : null;
    const scopedOperatorId = versionedParts?.[0] ?? null;
    const payload = versionedParts?.[1] ?? encodedValue;

    if (!payload || (versionedParts && !scopedOperatorId)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<FallbackConversationMeta>;

    if (
      !parsed.operatorId ||
      !parsed.travelerId ||
      (scopedOperatorId && parsed.operatorId !== scopedOperatorId)
    ) {
      return null;
    }

    return {
      travelerId: parsed.travelerId,
      operatorId: parsed.operatorId,
      listingId: typeof parsed.listingId === "string" && parsed.listingId.length > 0 ? parsed.listingId : null,
      inquiryId: typeof parsed.inquiryId === "string" && parsed.inquiryId.length > 0 ? parsed.inquiryId : null,
    } satisfies FallbackConversationMeta;
  } catch {
    return null;
  }
}

function isMissingRelationOrSchemaError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("Could not find the relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

function normalizeProfile(profile: { id: string; full_name: string; email: string | null; role: TravelerProfile["role"]; avatar_base64?: string | null; profile_image_url?: string | null; }): ProfileSummary {
  return {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role: profile.role,
    profile_image_url:
      normalizeProfileImageSource(profile.avatar_base64) ?? normalizeProfileImageSource(profile.profile_image_url) ?? null,
  };
}

function buildConversationTitle(role: DirectMessageRouteRole, travelerName: string, operatorName: string) {
  return role === "traveler" ? operatorName : travelerName;
}

function buildConversationSubtitle(
  role: DirectMessageRouteRole,
  listingTitle: string | null,
  listingLocation: string | null,
  inquiryDestination: string | null,
  inquiryStatus: TravelerInquiry["status"] | null,
) {
  const contextLabel = listingTitle ?? inquiryDestination ?? listingLocation ?? "Direct chat";
  const statusLabel = inquiryStatus ? ` · ${inquiryStatus}` : "";

  return role === "traveler" ? `${contextLabel}${statusLabel}` : `${contextLabel}${statusLabel}`;
}

function buildConversationLaunchHref(
  role: DirectMessageRouteRole,
  conversation: DirectConversationRecord & { inquiry_id: string | null },
) {
  if (conversation.inquiry_id) {
    return role === "traveler"
      ? `/Messages?inquiry=${conversation.inquiry_id}`
      : `/OperatorMessages?inquiry=${conversation.inquiry_id}`;
  }

  return role === "traveler"
    ? `/Messages?conversation=${conversation.id}`
    : `/OperatorMessages?conversation=${conversation.id}`;
}

async function notifyDirectMessageRecipient(params: {
  conversation: DirectConversationRecord;
  senderProfile: TravelerProfile;
  senderRole: DirectMessageRouteRole;
  message: string;
}) {
  let recipientProfileId: string | null =
    params.senderRole === "traveler" ? params.conversation.operator_id : params.conversation.traveler_id;

  if (!recipientProfileId && params.senderRole === "traveler") {
    const context = await buildLaunchContext({
      profile: params.senderProfile,
      listingId: params.conversation.listing_id,
      inquiryId: params.conversation.inquiry_id,
    });

    recipientProfileId = context?.operatorId ?? null;
  }

  if (!recipientProfileId || recipientProfileId === params.senderProfile.id) {
    return;
  }

  try {
    await recordPlatformNotification({
      recipientProfileId,
      actorProfileId: params.senderProfile.id,
      kind: "direct_message",
      title: params.senderRole === "traveler" ? "New traveler message" : "Operator reply received",
      body:
        params.senderRole === "traveler"
          ? `${params.senderProfile.full_name} sent a new message in your inbox.`
          : `${params.senderProfile.full_name} replied to your traveler inquiry.`,
      href:
        params.senderRole === "traveler"
          ? `/OperatorMessages?conversation=${params.conversation.id}`
          : `/Messages?conversation=${params.conversation.id}`,
      entityType: "conversation",
      entityId: params.conversation.id,
      metadata: {
        conversationId: params.conversation.id,
        inquiryId: params.conversation.inquiry_id,
        listingId: params.conversation.listing_id,
        senderRole: params.senderRole,
      },
    });

    await recordAdminNotifications({
      actorProfileId: params.senderProfile.id,
      kind: "direct_message",
      title: params.senderRole === "traveler" ? "New traveler message" : "Operator reply received",
      body:
        params.senderRole === "traveler"
          ? `${params.senderProfile.full_name} sent a new message in the platform.`
          : `${params.senderProfile.full_name} replied to a traveler message in the platform.`,
      href:
        params.conversation.inquiry_id != null
          ? `/AdminBookings?inquiry=${params.conversation.inquiry_id}`
          : `/AdminDashboard`,
      entityType: "conversation",
      entityId: params.conversation.id,
      metadata: {
        conversationId: params.conversation.id,
        inquiryId: params.conversation.inquiry_id,
        listingId: params.conversation.listing_id,
        senderRole: params.senderRole,
      },
    });
  } catch (error) {
    console.error("Unable to record direct message notification", {
      conversationId: params.conversation.id,
      recipientProfileId,
      senderProfileId: params.senderProfile.id,
      error,
    });
  }
}

function fallbackOperatorTitlePattern(operatorId: string) {
  return `${FALLBACK_CHAT_PREFIX}${FALLBACK_CHAT_VERSION}:${operatorId}:%`;
}

function assertDirectMessageAccess(profile: TravelerProfile, role: DirectMessageRouteRole) {
  if (!profile.is_active || profile.role !== role) {
    throw new Error("You do not have access to direct messages.");
  }
}

export async function ensureConversationForInquiry(params: {
  travelerId: string | null;
  operatorId: string;
  listingId: string | null;
  inquiryId: string;
}) {
  const admin = createSupabaseServiceRoleClient();

  let existingQuery = admin
    .from("traveler_operator_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("operator_id", params.operatorId)
    .eq("listing_id", params.listingId)
    .eq("inquiry_id", params.inquiryId);

  existingQuery = params.travelerId
    ? existingQuery.eq("traveler_id", params.travelerId)
    : existingQuery.is("traveler_id", null);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();

  if (existingError) {
    if (isMissingRelationOrSchemaError(existingError)) {
      return null;
    }

    throw new Error(existingError.message);
  }

  if (existing) {
    return existing as DirectConversationRecord;
  }

  const { data, error } = await admin
    .from("traveler_operator_conversations")
    .insert({
      traveler_id: params.travelerId,
      operator_id: params.operatorId,
      listing_id: params.listingId,
      inquiry_id: params.inquiryId,
      status: "open",
    })
    .select(CONVERSATION_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (data ?? null) as DirectConversationRecord | null;
}

async function resolveOperatorContextFromListing(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  listingId: string,
) {
  const { data, error } = await admin
    .from("inquiries")
    .select("operator_id,operator_name,created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return { operatorId: null as string | null, operatorName: null as string | null };
    }

    throw new Error(error.message);
  }

  const relatedInquiry = (data ?? []).find((entry) => Boolean(entry.operator_id || entry.operator_name)) as
    | { operator_id: string | null; operator_name: string | null }
    | undefined;

  return {
    operatorId: relatedInquiry?.operator_id ?? null,
    operatorName: relatedInquiry?.operator_name ?? null,
  };
}

async function resolveOperatorContextFromPublishedDraft(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  listingId: string,
) {
  const { data, error } = await admin
    .from("operator_listing_drafts")
    .select("operator_id,title,location,published_listing_id,updated_at")
    .eq("published_listing_id", listingId)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return { operatorId: null as string | null, operatorName: null as string | null };
    }

    throw new Error(error.message);
  }

  const draft = (data ?? []).find((entry) => Boolean(entry.operator_id)) as { operator_id: string | null } | undefined;

  if (!draft?.operator_id) {
    return { operatorId: null as string | null, operatorName: null as string | null };
  }

  return {
    operatorId: draft.operator_id,
    operatorName: null,
  };
}

async function touchProfileLastSeen(profileId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", profileId);

  if (error && !isMissingRelationOrSchemaError(error)) {
    throw new Error(error.message);
  }
}

async function loadFallbackConversationRecords(profileId: string, role: DirectMessageRouteRole) {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from("concierge_conversations")
    .select("id,user_id,title,created_at,updated_at")
    .like(
      "title",
      role === "operator"
        ? fallbackOperatorTitlePattern(profileId)
        : `${FALLBACK_CHAT_PREFIX}%`,
    )
    .order("updated_at", { ascending: false });

  if (role === "traveler") {
    query = query.eq("user_id", profileId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return [] as DirectConversationRecord[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as FallbackConciergeConversation[])
    .map((conversation) => {
      const meta = decodeFallbackConversationTitle(conversation.title);

      if (!meta) {
        return null;
      }

      if (
        meta.travelerId !== conversation.user_id ||
        (role === "traveler" && conversation.user_id !== profileId) ||
        (role === "operator" && meta.operatorId !== profileId)
      ) {
        return null;
      }

      return {
        id: conversation.id,
        traveler_id: conversation.user_id,
        operator_id: meta.operatorId,
        listing_id: meta.listingId,
        inquiry_id: meta.inquiryId,
        status: "open" as const,
        last_message_at: conversation.updated_at,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      } satisfies DirectConversationRecord;
    })
    .filter(Boolean) as DirectConversationRecord[];
}

async function loadFallbackConversationMessages(
  conversationIds: string[],
  profileId: string,
  role: DirectMessageRouteRole,
) {
  if (!conversationIds.length) {
    return [] as DirectMessageRecord[];
  }

  const admin = createSupabaseServiceRoleClient();
  let conversationsQuery = admin
    .from("concierge_conversations")
    .select("id,user_id,title")
    .in("id", conversationIds);

  conversationsQuery =
    role === "traveler"
      ? conversationsQuery.eq("user_id", profileId).like("title", `${FALLBACK_CHAT_PREFIX}%`)
      : conversationsQuery.like("title", fallbackOperatorTitlePattern(profileId));

  const { data: conversationsData, error: conversationsError } = await conversationsQuery;

  if (conversationsError) {
    if (isMissingRelationOrSchemaError(conversationsError)) {
      return [] as DirectMessageRecord[];
    }

    throw new Error(conversationsError.message);
  }

  const conversationById = new Map(
    ((conversationsData ?? []) as FallbackConciergeConversation[])
      .filter((conversation) => {
        const meta = decodeFallbackConversationTitle(conversation.title);
        return Boolean(
          meta &&
            meta.travelerId === conversation.user_id &&
            (role === "traveler"
              ? conversation.user_id === profileId
              : meta.operatorId === profileId),
        );
      })
      .map((conversation) => [conversation.id, conversation]),
  );
  const authorizedConversationIds = [...conversationById.keys()];

  if (!authorizedConversationIds.length) {
    return [] as DirectMessageRecord[];
  }

  const { data, error } = await admin
    .from("concierge_messages")
    .select("id,conversation_id,role,content,sources,created_at")
    .in("conversation_id", authorizedConversationIds)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return [] as DirectMessageRecord[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as FallbackConciergeMessage[]).map((message) => {
    const conversation = conversationById.get(message.conversation_id);
    const meta = decodeFallbackConversationTitle(conversation?.title ?? null);

    return {
      id: message.id,
      conversation_id: message.conversation_id,
      sender_id:
        message.role === "assistant"
          ? meta?.operatorId ?? conversation?.user_id ?? ""
          : conversation?.user_id ?? meta?.travelerId ?? "",
      sender_role: message.role === "assistant" ? "operator" : "traveler",
      message: message.content,
      read_at: null,
      created_at: message.created_at,
    } satisfies DirectMessageRecord;
  });
}

async function loadFallbackConversationByContext(params: {
  travelerId: string;
  operatorId: string;
  listingId?: string | null;
  inquiryId?: string | null;
}) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("concierge_conversations")
    .select("id,user_id,title,created_at,updated_at")
    .eq("user_id", params.travelerId)
    .like("title", fallbackOperatorTitlePattern(params.operatorId))
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (
    ((data ?? []) as FallbackConciergeConversation[])
      .map((conversation) => {
        const meta = decodeFallbackConversationTitle(conversation.title);

        if (
          !meta ||
          conversation.user_id !== params.travelerId ||
          meta.travelerId !== params.travelerId ||
          meta.operatorId !== params.operatorId
        ) {
          return null;
        }

        const listingMatches = params.listingId
          ? meta.listingId === params.listingId
          : meta.listingId === null;
        const inquiryMatches = params.inquiryId
          ? meta.inquiryId === params.inquiryId
          : meta.inquiryId === null;

        if (!listingMatches || !inquiryMatches) {
          return null;
        }

        return {
          id: conversation.id,
          traveler_id: conversation.user_id,
          operator_id: meta.operatorId,
          listing_id: meta.listingId,
          inquiry_id: meta.inquiryId,
          status: "open" as const,
          last_message_at: conversation.updated_at,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
        } satisfies DirectConversationRecord;
      })
      .find(Boolean) ?? null
  );
}

async function loadFallbackConversationById(conversationId: string, profileId: string, role: DirectMessageRouteRole) {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from("concierge_conversations")
    .select("id,user_id,title,created_at,updated_at")
    .eq("id", conversationId);

  query =
    role === "traveler"
      ? query.eq("user_id", profileId).like("title", `${FALLBACK_CHAT_PREFIX}%`)
      : query.like("title", fallbackOperatorTitlePattern(profileId));

  const { data, error } = await query.maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const conversation = data as FallbackConciergeConversation;
  const meta = decodeFallbackConversationTitle(conversation.title);

  if (!meta) {
    return null;
  }

  if (meta.travelerId !== conversation.user_id) {
    return null;
  }

  if (role === "traveler" && conversation.user_id !== profileId) {
    return null;
  }

  if (role === "operator" && meta.operatorId !== profileId) {
    return null;
  }

  return {
    id: conversation.id,
    traveler_id: conversation.user_id,
    operator_id: meta.operatorId,
    listing_id: meta.listingId,
    inquiry_id: meta.inquiryId,
    status: "open" as const,
    last_message_at: conversation.updated_at,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
  } satisfies DirectConversationRecord;
}

async function createFallbackConversation(params: {
  travelerId: string;
  operatorId: string;
  listingId?: string | null;
  inquiryId?: string | null;
}) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("concierge_conversations")
    .insert({
      user_id: params.travelerId,
      title: encodeFallbackConversationTitle({
        travelerId: params.travelerId,
        operatorId: params.operatorId,
        listingId: params.listingId ?? null,
        inquiryId: params.inquiryId ?? null,
      }),
    })
    .select("id,user_id,title,created_at,updated_at")
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  const record = data as FallbackConciergeConversation | null;

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    traveler_id: record.user_id,
    operator_id: params.operatorId,
    listing_id: params.listingId ?? null,
    inquiry_id: params.inquiryId ?? null,
    status: "open" as const,
    last_message_at: record.updated_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  } satisfies DirectConversationRecord;
}

async function saveFallbackConversationMessage(params: {
  conversation: DirectConversationRecord;
  profile: TravelerProfile;
  role: DirectMessageRouteRole;
  message: string;
}) {
  if (
    (params.role === "traveler" && params.conversation.traveler_id !== params.profile.id) ||
    (params.role === "operator" && params.conversation.operator_id !== params.profile.id)
  ) {
    throw new Error("You do not have access to this conversation.");
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("concierge_messages")
    .insert({
      conversation_id: params.conversation.id,
      role: params.role === "operator" ? "assistant" : "user",
      content: params.message,
      sources: [
        {
          kind: "direct_operator_chat",
          travelerId: params.conversation.traveler_id,
          operatorId: params.conversation.operator_id,
          listingId: params.conversation.listing_id,
          inquiryId: params.conversation.inquiry_id,
          senderId: params.profile.id,
          senderRole: params.role,
        },
      ],
    })
    .select("id,conversation_id,role,content,sources,created_at")
    .maybeSingle();

  if (error || !data) {
    if (error && isMissingRelationOrSchemaError(error)) {
      throw new Error("Direct messages are not available yet.");
    }

    throw new Error(error?.message ?? "Unable to send the message.");
  }

  const saved = data as FallbackConciergeMessage;

  return {
    id: saved.id,
    conversation_id: saved.conversation_id,
    sender_id: params.profile.id,
    sender_role: params.role,
    message: saved.content,
    read_at: null,
    created_at: saved.created_at,
  } satisfies DirectMessageRecord;
}

async function loadProfilesByIds(profileIds: string[]) {
  if (!profileIds.length) {
    return new Map<string, ProfileSummary>();
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", profileIds);

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return new Map<string, ProfileSummary>();
    }

    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as Array<{
      id: string;
      full_name: string;
      email: string | null;
      role: TravelerProfile["role"];
      avatar_base64?: string | null;
      profile_image_url?: string | null;
    }>).map((profile) => [profile.id, normalizeProfile(profile)]),
  );
}

async function loadListingsByIds(listingIds: string[]) {
  if (!listingIds.length) {
    return new Map<string, { id: string; title: string; location: string; operator_id: string | null; operator_name: string }>();
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("tour_listings")
    .select(LISTING_COLUMNS)
    .in("id", listingIds);

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return new Map();
    }

    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as Array<{
      id: string;
      title: string;
      location: string;
      operator_id: string | null;
      operator_name: string;
      image_base64?: string | null;
      image_url?: string | null;
    }>).map((listing) => [listing.id, listing]),
  );
}

async function loadInquiriesByIds(inquiryIds: string[]) {
  if (!inquiryIds.length) {
    return new Map<string, TravelerInquiry>();
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("inquiries")
    .select(INQUIRY_COLUMNS)
    .in("id", inquiryIds);

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return new Map();
    }

    throw new Error(error.message);
  }

  return new Map((data ?? []).map((inquiry) => [inquiry.id, inquiry as TravelerInquiry]));
}

async function loadInboxInquiries(profile: TravelerProfile, role: DirectMessageRouteRole) {
  const admin = createSupabaseServiceRoleClient();
  const filterColumn = role === "traveler" ? "user_id" : "operator_id";
  const { data, error } = await admin
    .from("inquiries")
    .select(INQUIRY_COLUMNS)
    .eq(filterColumn, profile.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return [] as InboxInquiryRow[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as InboxInquiryRow[];
}

async function loadConversationRecords(profileId: string, role: DirectMessageRouteRole) {
  const admin = createSupabaseServiceRoleClient();
  const participantColumn = role === "traveler" ? "traveler_id" : "operator_id";
  const { data, error } = await admin
    .from("traveler_operator_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq(participantColumn, profileId)
    .order("last_message_at", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return loadFallbackConversationRecords(profileId, role);
    }

    throw new Error(error.message);
  }

  return (data ?? []) as DirectConversationRecord[];
}

async function loadConversationMessages(
  conversationIds: string[],
  profileId: string,
  role: DirectMessageRouteRole,
) {
  if (!conversationIds.length) {
    return [] as DirectMessageRecord[];
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("traveler_operator_messages")
    .select(MESSAGE_COLUMNS)
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return loadFallbackConversationMessages(conversationIds, profileId, role);
    }

    throw new Error(error.message);
  }

  return (data ?? []) as DirectMessageRecord[];
}

async function markConversationMessagesRead(conversationId: string, profileId: string, role: DirectMessageRouteRole) {
  const admin = createSupabaseServiceRoleClient();
  const senderRole = role === "traveler" ? "operator" : "traveler";

  const { error } = await admin
    .from("traveler_operator_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("sender_role", senderRole)
    .is("read_at", null);

  if (error && !isMissingRelationOrSchemaError(error)) {
    console.error("Unable to mark direct messages as read", { profileId, conversationId, error: error.message });
    return;
  }

  if (error && isMissingRelationOrSchemaError(error)) {
    await touchProfileLastSeen(profileId);
    return;
  }

  await touchProfileLastSeen(profileId);
}

function mergeConversationSummaries(
  records: DirectConversationRecord[],
  messages: DirectMessageRecord[],
  role: DirectMessageRouteRole,
  profiles: Map<string, ProfileSummary>,
  listings: Map<string, { id: string; title: string; location: string; operator_id: string | null; operator_name: string }>,
  inquiries: Map<string, TravelerInquiry>,
  lastSeenAt: string | null,
) {
  const latestMessageByConversation = new Map<string, DirectMessageRecord>();
  const unreadCountByConversation = new Map<string, number>();
  const unreadBoundary = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;

  for (const message of messages) {
    latestMessageByConversation.set(message.conversation_id, message);

    if (message.sender_role !== role && (!message.read_at || new Date(message.created_at).getTime() > unreadBoundary)) {
      unreadCountByConversation.set(
        message.conversation_id,
        (unreadCountByConversation.get(message.conversation_id) ?? 0) + 1,
      );
    }
  }

  return records.map((conversation) => {
    const traveler = conversation.traveler_id ? profiles.get(conversation.traveler_id) ?? null : null;
    const operator = profiles.get(conversation.operator_id) ?? null;
    const listing = conversation.listing_id ? listings.get(conversation.listing_id) ?? null : null;
    const inquiry = conversation.inquiry_id ? inquiries.get(conversation.inquiry_id) ?? null : null;
    const latestMessage = latestMessageByConversation.get(conversation.id) ?? null;

    const travelerName = traveler?.full_name ?? inquiry?.traveler_name ?? "Traveler";
    const operatorName = operator?.full_name ?? inquiry?.operator_name ?? listing?.operator_name ?? "Operator";
    const listingTitle = listing?.title ?? inquiry?.destination ?? null;
    const listingLocation = listing?.location ?? inquiry?.destination_country ?? null;
    const inquiryDestination = inquiry?.destination ?? null;
    const inquiryStatus = inquiry?.status ?? null;

    return {
      ...conversation,
      traveler_name: travelerName,
      traveler_email: traveler?.email ?? inquiry?.traveler_email ?? null,
      traveler_image_url: traveler?.profile_image_url ?? null,
      operator_name: operatorName,
      operator_email: operator?.email ?? null,
      operator_image_url: operator?.profile_image_url ?? null,
      listing_title: listingTitle,
      listing_location: listingLocation,
      inquiry_destination: inquiryDestination,
      inquiry_status: inquiryStatus,
      last_message_preview: latestMessage?.message ?? null,
      last_sender_role: latestMessage?.sender_role ?? null,
      unread_count: unreadCountByConversation.get(conversation.id) ?? 0,
      title: buildConversationTitle(role, travelerName, operatorName),
      subtitle: buildConversationSubtitle(role, listingTitle, listingLocation, inquiryDestination, inquiryStatus),
      counterpart_name: role === "traveler" ? operatorName : travelerName,
      launch_href: buildConversationLaunchHref(role, conversation),
    } satisfies DirectConversationSummary;
  });
}

function buildInboxInquirySummaries(params: {
  inquiries: InboxInquiryRow[];
  role: DirectMessageRouteRole;
  profiles: Map<string, ProfileSummary>;
  listings: Map<string, { id: string; title: string; location: string; operator_id: string | null; operator_name: string }>;
  conversationKeys: Set<string>;
}) {
  return params.inquiries
    .filter((inquiry) => !params.conversationKeys.has(inquiry.id))
    .map((inquiry) => {
      const listing = inquiry.listing_id ? params.listings.get(inquiry.listing_id) ?? null : null;
      const travelerName = inquiry.traveler_name || "Traveler";
      const operatorName = inquiry.operator_name || listing?.operator_name || "Operator";
      const listingTitle = listing?.title ?? inquiry.destination ?? null;
      const listingLocation = listing?.location ?? inquiry.destination_country ?? null;
      const latestActivityAt = inquiry.updated_at ?? inquiry.created_at;
      const title = params.role === "traveler" ? operatorName : travelerName;
      const subtitle = buildConversationSubtitle(
        params.role,
        listingTitle,
        listingLocation,
        inquiry.destination,
        inquiry.status,
      );
      const launchHref =
        params.role === "traveler"
          ? `/Messages?inquiry=${inquiry.id}`
          : `/OperatorMessages?inquiry=${inquiry.id}`;
      const previewText = inquiry.notes?.trim() || (inquiry.destination ? `Inquiry for ${inquiry.destination}` : null);
      const travelerProfile = inquiry.user_id ? params.profiles.get(inquiry.user_id) ?? null : null;
      const operatorProfile = inquiry.operator_id ? params.profiles.get(inquiry.operator_id) ?? null : null;

      return {
        id: `inquiry:${inquiry.id}`,
        traveler_id: inquiry.user_id ?? "",
        operator_id: inquiry.operator_id ?? listing?.operator_id ?? "",
        listing_id: inquiry.listing_id,
        inquiry_id: inquiry.id,
        status: "open" as const,
        last_message_at: latestActivityAt,
        created_at: inquiry.created_at,
        updated_at: inquiry.updated_at,
        traveler_name: travelerName,
        traveler_email: inquiry.traveler_email ?? null,
        traveler_image_url: travelerProfile?.profile_image_url ?? null,
        operator_name: operatorName,
        operator_email: operatorProfile?.email ?? null,
        operator_image_url: operatorProfile?.profile_image_url ?? null,
        listing_title: listingTitle,
        listing_location: listingLocation,
        inquiry_destination: inquiry.destination ?? null,
        inquiry_status: inquiry.status,
        last_message_preview: previewText,
        last_sender_role: null,
        unread_count: 0,
        title,
        subtitle,
        counterpart_name: params.role === "traveler" ? operatorName : travelerName,
        launch_href: launchHref,
      } satisfies DirectConversationSummary;
    });
}

async function buildLaunchContext(params: {
  profile: TravelerProfile;
  listingId?: string | null;
  inquiryId?: string | null;
}) {
  const context: LaunchContext = {
    listingId: params.listingId?.trim() || null,
    inquiryId: params.inquiryId?.trim() || null,
    operatorId: null,
    operatorName: null,
    listingTitle: null,
    listingLocation: null,
    datesLabel: null,
    inquiryStatus: null,
    travelerName: params.profile.full_name,
    travelerId: params.profile.role === "traveler" ? params.profile.id : null,
  };

  if (context.inquiryId) {
    const admin = createSupabaseServiceRoleClient();
    const { data: inquiry, error } = await admin
      .from("inquiries")
    .select("id,user_id,listing_id,traveler_name,traveler_email,operator_id,operator_name,destination,destination_country,preferred_start_date,preferred_end_date,status")
    .eq("id", context.inquiryId)
    .maybeSingle();

    if (error || !inquiry) {
      return null;
    }

    if (params.profile.role === "traveler" && inquiry.user_id !== params.profile.id) {
      return null;
    }

    context.inquiryId = inquiry.id;
    context.listingId = inquiry.listing_id ?? context.listingId;
    context.operatorId = inquiry.operator_id ?? null;
    context.operatorName = inquiry.operator_name ?? null;
    context.inquiryStatus = inquiry.status as TravelerInquiry["status"];
    context.listingTitle = inquiry.destination;
    context.listingLocation = inquiry.destination_country;
    context.travelerId = inquiry.user_id ?? null;
    context.datesLabel =
      inquiry.preferred_start_date && inquiry.preferred_end_date
        ? `${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(inquiry.preferred_start_date))} to ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(inquiry.preferred_end_date))}`
        : null;
    context.travelerName = inquiry.traveler_name;

    if (inquiry.listing_id) {
      const { data: listing } = await admin
        .from("tour_listings")
        .select("id,title,location,operator_id,operator_name")
        .eq("id", inquiry.listing_id)
        .maybeSingle();

      if (listing) {
        context.listingTitle = listing.title ?? context.listingTitle;
        context.listingLocation = listing.location ?? context.listingLocation;
        context.operatorId = inquiry.operator_id ?? listing.operator_id ?? null;
        context.operatorName = inquiry.operator_name ?? listing.operator_name ?? context.operatorName;
      }
    }

    if (!context.operatorId && context.listingId) {
      const relatedContext = await resolveOperatorContextFromListing(admin, context.listingId);
      context.operatorId = relatedContext.operatorId ?? context.operatorId;
      context.operatorName = relatedContext.operatorName ?? context.operatorName;
    }

    if (!context.operatorId && context.listingId) {
      const relatedDraftContext = await resolveOperatorContextFromPublishedDraft(admin, context.listingId);
      context.operatorId = relatedDraftContext.operatorId ?? context.operatorId;
      context.operatorName = relatedDraftContext.operatorName ?? context.operatorName;
    }

    if (params.profile.role === "operator") {
      if (context.operatorId !== params.profile.id) {
        return null;
      }

      context.operatorName = params.profile.full_name;
    }

    return context;
  }

  if (context.listingId) {
    const admin = createSupabaseServiceRoleClient();
    const { data: listing, error } = await admin
      .from("tour_listings")
      .select("id,title,location,operator_id,operator_name")
      .eq("id", context.listingId)
      .maybeSingle();

    if (error || !listing) {
      return null;
    }

    context.operatorId = listing.operator_id ?? null;
    context.operatorName = listing.operator_name ?? null;
    context.listingTitle = listing.title;
    context.listingLocation = listing.location;

    if (!context.operatorId) {
      const relatedContext = await resolveOperatorContextFromListing(admin, context.listingId);
      context.operatorId = relatedContext.operatorId ?? context.operatorId;
      context.operatorName = relatedContext.operatorName ?? context.operatorName;
    }

    if (!context.operatorId) {
      const relatedDraftContext = await resolveOperatorContextFromPublishedDraft(admin, context.listingId);
      context.operatorId = relatedDraftContext.operatorId ?? context.operatorId;
      context.operatorName = relatedDraftContext.operatorName ?? context.operatorName;
    }

    if (params.profile.role === "operator") {
      if (context.operatorId !== params.profile.id) {
        return null;
      }

      context.operatorName = params.profile.full_name;
    }

    return context;
  }

  return context;
}

async function findConversationByContext(params: {
  travelerId: string;
  operatorId: string;
  listingId?: string | null;
  inquiryId?: string | null;
}) {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from("traveler_operator_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("traveler_id", params.travelerId)
    .eq("operator_id", params.operatorId);

  if (params.listingId) {
    query = query.eq("listing_id", params.listingId);
  } else {
    query = query.is("listing_id", null);
  }

  if (params.inquiryId) {
    query = query.eq("inquiry_id", params.inquiryId);
  } else {
    query = query.is("inquiry_id", null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return loadFallbackConversationByContext(params);
    }

    throw new Error(error.message);
  }

  return (data ?? null) as DirectConversationRecord | null;
}

async function ensureConversationByContext(params: {
  travelerId: string;
  operatorId: string;
  listingId?: string | null;
  inquiryId?: string | null;
}) {
  const existing = await findConversationByContext(params);
  if (existing) {
    return existing;
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("traveler_operator_conversations")
    .insert({
      traveler_id: params.travelerId,
      operator_id: params.operatorId,
      listing_id: params.listingId ?? null,
      inquiry_id: params.inquiryId ?? null,
      status: "open",
    })
    .select(CONVERSATION_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaError(error)) {
      return loadFallbackConversationByContext(params);
    }

    throw new Error(error.message);
  }

  return (data ?? null) as DirectConversationRecord | null;
}

export async function getDirectMessagePageState(params: {
  profile: TravelerProfile;
  role: DirectMessageRouteRole;
  conversationId?: string | null;
  listingId?: string | null;
  inquiryId?: string | null;
  markAsSeen?: boolean;
}): Promise<DirectMessagePageState> {
  assertDirectMessageAccess(params.profile, params.role);

  let conversations = await loadConversationRecords(params.profile.id, params.role);
  const context = await buildLaunchContext({
    profile: params.profile,
    listingId: params.listingId,
    inquiryId: params.inquiryId,
  });

  let activeConversationRecord: DirectConversationRecord | null = null;

  if (params.conversationId) {
    activeConversationRecord = conversations.find((conversation) => conversation.id === params.conversationId) ?? null;
  } else if (
    context?.operatorId &&
    (params.role === "traveler" || Boolean(context.inquiryId && context.travelerId))
  ) {
    const ensuredConversation =
      (await ensureConversationByContext({
        travelerId: params.profile.role === "traveler" ? params.profile.id : context.travelerId ?? params.profile.id,
        operatorId: context.operatorId,
        listingId: context.listingId,
        inquiryId: context.inquiryId,
      })) ?? null;
    activeConversationRecord = ensuredConversation;
    if (ensuredConversation && !conversations.some((conversation) => conversation.id === ensuredConversation.id)) {
      conversations = [ensuredConversation, ...conversations];
    }
  } else if (conversations.length) {
    activeConversationRecord = conversations[0] ?? null;
  }

  if (
    activeConversationRecord &&
    ((params.role === "traveler" && activeConversationRecord.traveler_id !== params.profile.id) ||
      (params.role === "operator" && activeConversationRecord.operator_id !== params.profile.id))
  ) {
    activeConversationRecord = null;
  }

  const inboxInquiries = await loadInboxInquiries(params.profile, params.role);

  const allRelatedIds = [
    ...new Set(
      conversations.flatMap((conversation) => [
        conversation.traveler_id,
        conversation.operator_id,
        conversation.inquiry_id,
      ]).filter((value): value is string => Boolean(value)),
    ),
  ];

  const conversationIds = conversations.map((conversation) => conversation.id);
  const listingIds = [
    ...new Set(
      [
        ...conversations.map((conversation) => conversation.listing_id),
        ...inboxInquiries.map((inquiry) => inquiry.listing_id),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  const inboxProfileIds = [
    ...new Set(
      inboxInquiries
        .flatMap((inquiry) => [inquiry.user_id, inquiry.operator_id])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const [messages, profiles, listings, inquiries] = await Promise.all([
    loadConversationMessages(conversationIds, params.profile.id, params.role),
    loadProfilesByIds([...new Set([...allRelatedIds, ...inboxProfileIds])]),
    loadListingsByIds(listingIds),
    loadInquiriesByIds([...new Set(conversations.map((conversation) => conversation.inquiry_id).filter((value): value is string => Boolean(value)))]),
  ]);

  let conversationSummaries = mergeConversationSummaries(
    conversations,
    messages,
    params.role,
    profiles,
    listings,
    inquiries,
    params.profile.last_seen_at,
  );

  const inboxConversationKeys = new Set(
    conversations.map((conversation) => conversation.inquiry_id).filter((value): value is string => Boolean(value)),
  );
  const inboxSummaries = buildInboxInquirySummaries({
    inquiries: inboxInquiries,
    role: params.role,
    profiles,
    listings,
    conversationKeys: inboxConversationKeys,
  });

  conversationSummaries = [...conversationSummaries, ...inboxSummaries].sort(
    (left, right) =>
      new Date(right.last_message_at ?? right.updated_at).getTime() -
      new Date(left.last_message_at ?? left.updated_at).getTime(),
  );

  const activeConversation = activeConversationRecord
    ? conversationSummaries.find((conversation) => conversation.id === activeConversationRecord?.id) ?? null
    : null;
  const activeMessages = activeConversationRecord
    ? messages.filter((message) => message.conversation_id === activeConversationRecord.id)
    : [];

  if (activeConversationRecord) {
    if (params.markAsSeen ?? false) {
      await markConversationMessagesRead(activeConversationRecord.id, params.profile.id, params.role);
    }
    conversationSummaries = conversationSummaries.map((conversation) =>
      conversation.id === activeConversationRecord.id
        ? { ...conversation, unread_count: 0 }
        : conversation,
    );
  }

  return {
    conversations: conversationSummaries,
    activeConversation,
    messages: activeMessages,
    context,
  };
}

export async function sendDirectMessage(params: {
  profile: TravelerProfile;
  role: DirectMessageRouteRole;
  message: string;
  conversationId?: string | null;
  listingId?: string | null;
  inquiryId?: string | null;
}) {
  assertDirectMessageAccess(params.profile, params.role);

  const admin = createSupabaseServiceRoleClient();
  const message = params.message.trim();

  if (!message) {
    throw new Error("Please enter a message before sending.");
  }

  let conversation: DirectConversationRecord | null = null;

  if (params.role === "operator" && params.conversationId?.startsWith("inquiry:")) {
    const inquiryId = params.conversationId.slice("inquiry:".length).trim();
    const { data: inquiry, error } = await admin
      .from("inquiries")
      .select("id,user_id,listing_id,operator_id,operator_name")
      .eq("id", inquiryId)
      .maybeSingle();

    if (error || !inquiry) {
      throw new Error(error?.message ?? "Unable to load this inquiry.");
    }

    const assignedToOperator = inquiry.operator_id === params.profile.id;

    if (!assignedToOperator) {
      throw new Error("You do not have access to this inquiry.");
    }

    conversation = await ensureConversationForInquiry({
      travelerId: inquiry.user_id ?? null,
      operatorId: params.profile.id,
      listingId: inquiry.listing_id ?? null,
      inquiryId: inquiry.id,
    });

    if (!conversation) {
      throw new Error("Guest messaging is not available until the latest database migration is applied.");
    }
  }

  if (!conversation && params.conversationId && !params.conversationId.startsWith("inquiry:")) {
    const { data, error } = await admin
      .from("traveler_operator_conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("id", params.conversationId)
      .maybeSingle();

    if (error) {
      if (isMissingRelationOrSchemaError(error)) {
        conversation = await loadFallbackConversationById(params.conversationId, params.profile.id, params.role);
      } else {
        throw new Error(error.message);
      }
    }

    if (data) {
      const record = data as DirectConversationRecord;
      if (
        (params.role === "traveler" && record.traveler_id !== params.profile.id) ||
        (params.role === "operator" && record.operator_id !== params.profile.id)
      ) {
        throw new Error("You do not have access to this conversation.");
      }

      conversation = record;
    }
  }

  if (!conversation && params.role === "operator") {
    throw new Error("Operators can reply from an existing conversation only.");
  }

  if (!conversation && (params.listingId || params.inquiryId)) {
    const context = await buildLaunchContext({
      profile: params.profile,
      listingId: params.listingId,
      inquiryId: params.inquiryId,
    });

    if (!context?.operatorId) {
      throw new Error("Unable to resolve the operator for this conversation.");
    }

    conversation =
      (await findConversationByContext({
        travelerId: params.profile.id,
        operatorId: context.operatorId,
        listingId: context.listingId,
        inquiryId: context.inquiryId,
      })) ?? null;

    if (!conversation) {
      const { data, error } = await admin
        .from("traveler_operator_conversations")
        .insert({
          traveler_id: params.profile.id,
          operator_id: context.operatorId,
          listing_id: context.listingId,
          inquiry_id: context.inquiryId,
          status: "open",
        })
        .select(CONVERSATION_COLUMNS)
        .maybeSingle();

      if (error || !data) {
        if (error && isMissingRelationOrSchemaError(error)) {
          conversation =
            (await createFallbackConversation({
              travelerId: params.profile.id,
              operatorId: context.operatorId,
              listingId: context.listingId,
              inquiryId: context.inquiryId,
            })) ?? null;
        } else {
          throw new Error(error?.message ?? "Unable to start the conversation.");
        }
      } else {
        conversation = data as DirectConversationRecord;
      }
    }
  }

  if (!conversation) {
    throw new Error("Unable to resolve a conversation for this message.");
  }

  let savedMessage: DirectMessageRecord | null = null;

  try {
    const { data, error } = await admin
      .from("traveler_operator_messages")
      .insert({
        conversation_id: conversation.id,
        sender_id: params.profile.id,
        sender_role: params.role,
        message,
      })
      .select(MESSAGE_COLUMNS)
      .maybeSingle();

    if (error || !data) {
      if (error && isMissingRelationOrSchemaError(error)) {
        savedMessage = await saveFallbackConversationMessage({
          conversation,
          profile: params.profile,
          role: params.role,
          message,
        });
      } else {
        throw new Error(error?.message ?? "Unable to send the message.");
      }
    } else {
      savedMessage = data as DirectMessageRecord;
    }
  } catch (error) {
    if (error instanceof Error && isMissingRelationOrSchemaError(error as { code?: string | null; message?: string | null })) {
      savedMessage = await saveFallbackConversationMessage({
        conversation,
        profile: params.profile,
        role: params.role,
        message,
      });
    } else {
      throw error;
    }
  }

  const pageState = await getDirectMessagePageState({
    profile: params.profile,
    role: params.role,
    conversationId: conversation.id,
    markAsSeen: true,
  });

  await notifyDirectMessageRecipient({
    conversation,
    senderProfile: params.profile,
    senderRole: params.role,
    message,
  });

  if (params.role === "operator") {
    const emailResult = await sendOperatorReplyNotificationForConversation(conversation.id, message).catch((error) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : "Unable to send operator reply email.",
    }));

    if (!emailResult.ok) {
      console.error("Operator reply email warning", {
        conversationId: conversation.id,
        error: "error" in emailResult ? emailResult.error : "Operator reply email was not sent.",
      });
    }
  }

  return {
    conversationId: conversation.id,
    message: savedMessage as DirectMessageRecord,
    ...pageState,
  };
}
