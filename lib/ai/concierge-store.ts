import "server-only";

import {
  isConciergeQuotaLedgerId,
  isConciergeQuotaLedgerTitle,
} from "@/lib/ai/concierge-hidden";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const DIRECT_CHAT_PREFIX = "__operator_chat__:";

export type ConciergeConversationSummary = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
  last_message_role: "user" | "assistant" | "system" | null;
};

export type ConciergeMessageRecord = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: unknown[] | null;
  created_at: string;
};

export type ConciergeConversationRecord = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type ConciergePageState = {
  conversations: ConciergeConversationSummary[];
  activeConversation: ConciergeConversationRecord | null;
  messages: ConciergeMessageRecord[];
};

function isMissingRelationOrSchemaCacheError(error: { code?: string | null; message?: string | null } | null) {
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

function cleanConversationTitle(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/[^\w\s'&-]/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const words = normalized.split(" ").slice(0, 6);
  const title = words.join(" ");

  return title.length > 60 ? `${title.slice(0, 57).trim()}...` : title;
}

export function deriveConciergeConversationTitle(message: string) {
  return cleanConversationTitle(message) ?? "Travel ideas";
}

export async function getConciergeConversationSummaries(userId: string, limit = 5) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("concierge_conversations")
    .select("id,title,created_at,updated_at")
    .eq("user_id", userId)
    .or(`title.is.null,title.not.like.${DIRECT_CHAT_PREFIX}%`)
    .order("updated_at", { ascending: false })
    .limit(limit + 1);

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error)) {
      return [] as ConciergeConversationSummary[];
    }

    throw new Error(error.message);
  }

  const conversations = ((data ?? []) as Array<ConciergeConversationRecord>)
    .filter((conversation) => !isConciergeQuotaLedgerTitle(conversation.title))
    .slice(0, limit);

  const summaries = await Promise.all(
    conversations.map(async (conversation) => {
      const { data: messageData, error: messageError } = await admin
        .from("concierge_messages")
        .select("role,content,created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (messageError && !isMissingRelationOrSchemaCacheError(messageError)) {
        throw new Error(messageError.message);
      }

      return {
        id: conversation.id,
        title: conversation.title,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        last_message_preview: messageData?.content ? messageData.content.slice(0, 110) : null,
        last_message_role: messageData?.role ?? null,
      } satisfies ConciergeConversationSummary;
    }),
  );

  return summaries;
}

export async function getConciergeConversationById(conversationId: string, userId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("concierge_conversations")
    .select("id,user_id,title,created_at,updated_at")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  const conversation = (data ?? null) as ConciergeConversationRecord | null;
  return conversation && !isConciergeQuotaLedgerTitle(conversation.title)
    ? conversation
    : null;
}

export async function getLatestConciergeConversation(userId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("concierge_conversations")
    .select("id,user_id,title,created_at,updated_at")
    .eq("user_id", userId)
    .or(`title.is.null,title.not.like.${DIRECT_CHAT_PREFIX}%`)
    .order("updated_at", { ascending: false })
    .limit(2);

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (
    ((data ?? []) as ConciergeConversationRecord[]).find(
      (conversation) => !isConciergeQuotaLedgerTitle(conversation.title),
    ) ?? null
  );
}

export async function createConciergeConversation(userId: string, title: string | null = null) {
  if (isConciergeQuotaLedgerTitle(title)) {
    return null;
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("concierge_conversations")
    .insert({
      user_id: userId,
      title,
    })
    .select("id,user_id,title,created_at,updated_at")
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (data ?? null) as ConciergeConversationRecord | null;
}

export async function deleteConciergeConversation(params: { conversationId: string; userId: string }) {
  if (isConciergeQuotaLedgerId(params.conversationId, params.userId)) {
    return false;
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: ownedConversation, error: lookupError } = await admin
    .from("concierge_conversations")
    .select("id,title")
    .eq("id", params.conversationId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (lookupError) {
    if (isMissingRelationOrSchemaCacheError(lookupError)) {
      return false;
    }

    throw new Error(lookupError.message);
  }

  if (!ownedConversation || isConciergeQuotaLedgerTitle(ownedConversation.title)) {
    return false;
  }

  const { error } = await admin
    .from("concierge_conversations")
    .delete()
    .eq("id", params.conversationId)
    .eq("user_id", params.userId);

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error)) {
      return false;
    }

    throw new Error(error.message);
  }

  return true;
}

export async function getOrCreateConciergeConversation(params: {
  userId: string;
  conversationId?: string | null;
  title?: string | null;
}) {
  const requestedConversationId = params.conversationId?.trim() || null;

  if (requestedConversationId) {
    const conversation = await getConciergeConversationById(requestedConversationId, params.userId);
    if (conversation) {
      return conversation;
    }
  }

  const latestConversation = await getLatestConciergeConversation(params.userId);
  if (latestConversation) {
    return latestConversation;
  }

  return createConciergeConversation(params.userId, params.title ?? null);
}

export async function updateConciergeConversationTitle(params: {
  conversationId: string;
  userId: string;
  title: string;
}) {
  if (
    isConciergeQuotaLedgerId(params.conversationId, params.userId) ||
    isConciergeQuotaLedgerTitle(params.title)
  ) {
    return;
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("concierge_conversations")
    .update({ title: params.title })
    .eq("id", params.conversationId)
    .eq("user_id", params.userId);

  if (error && !isMissingRelationOrSchemaCacheError(error)) {
    throw new Error(error.message);
  }
}

export async function saveConciergeMessage(params: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: unknown[] | null;
}) {
  const admin = createSupabaseServiceRoleClient();
  const payload: Record<string, unknown> = {
    conversation_id: params.conversationId,
    role: params.role,
    content: params.content,
  };

  if (params.sources) {
    payload.sources = params.sources;
  }

  const { data, error } = await admin
    .from("concierge_messages")
    .insert(payload)
    .select("id,conversation_id,role,content,sources,created_at")
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (data ?? null) as ConciergeMessageRecord | null;
}

export async function getConciergeConversationMessages(params: {
  conversationId: string;
  userId: string;
  limit?: number;
}) {
  const admin = createSupabaseServiceRoleClient();
  const conversation = await getConciergeConversationById(params.conversationId, params.userId);

  if (!conversation) {
    return [] as ConciergeMessageRecord[];
  }

  const { data, error } = await admin
    .from("concierge_messages")
    .select("id,conversation_id,role,content,sources,created_at")
    .eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: true })
    .limit(params.limit ?? 40);

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error)) {
      return [] as ConciergeMessageRecord[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as ConciergeMessageRecord[];
}

export async function getConciergePageState(params: {
  userId: string;
  conversationId?: string | null;
}) {
  const conversations = await getConciergeConversationSummaries(params.userId);
  const activeConversation = params.conversationId
    ? await getConciergeConversationById(params.conversationId, params.userId)
    : await getLatestConciergeConversation(params.userId);

  const messages = activeConversation
    ? await getConciergeConversationMessages({
        conversationId: activeConversation.id,
        userId: params.userId,
      })
    : [];

  return {
    conversations,
    activeConversation,
    messages,
  } satisfies ConciergePageState;
}
