import "server-only";

import {
  CONCIERGE_QUOTA_LEDGER_TITLE,
  CONCIERGE_QUOTA_MARKER_CONTENT,
  getConciergeQuotaLedgerId,
} from "@/lib/ai/concierge-hidden";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const BURST_WINDOW_MS = 10 * 60 * 1000;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const CONCIERGE_BURST_LIMIT = 20;
export const CONCIERGE_DAILY_LIMIT = 100;

type ConciergeQuotaSnapshot = {
  burstCount: number;
  dailyCount: number;
  allowed: boolean;
  retryAfterSeconds: number;
};

export type ConciergeQuotaMarker = {
  id: string;
  conversationId: string;
};

const profileLocks = new Map<string, Promise<void>>();

async function getOrCreateConciergeQuotaLedger(profileId: string) {
  const admin = createSupabaseServiceRoleClient();
  const ledgerId = getConciergeQuotaLedgerId(profileId);
  const select = "id,user_id,title";
  const existingResult = await admin
    .from("concierge_conversations")
    .select(select)
    .eq("id", ledgerId)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  if (existingResult.data) {
    if (
      existingResult.data.user_id !== profileId ||
      existingResult.data.title !== CONCIERGE_QUOTA_LEDGER_TITLE
    ) {
      throw new Error("The Concierge quota ledger identifier is unavailable.");
    }

    return { id: existingResult.data.id };
  }

  const insertResult = await admin
    .from("concierge_conversations")
    .insert({
      id: ledgerId,
      user_id: profileId,
      title: CONCIERGE_QUOTA_LEDGER_TITLE,
    })
    .select(select)
    .maybeSingle();

  if (!insertResult.error && insertResult.data) {
    return { id: insertResult.data.id };
  }

  // Another worker may have inserted the deterministic ledger after the
  // initial read. Re-read on a uniqueness race, but never overwrite a row.
  if (insertResult.error?.code === "23505") {
    const racedResult = await admin
      .from("concierge_conversations")
      .select(select)
      .eq("id", ledgerId)
      .maybeSingle();

    if (
      !racedResult.error &&
      racedResult.data?.user_id === profileId &&
      racedResult.data.title === CONCIERGE_QUOTA_LEDGER_TITLE
    ) {
      return { id: racedResult.data.id };
    }

    throw new Error(
      racedResult.error?.message ?? "The Concierge quota ledger could not be verified.",
    );
  }

  throw new Error(
    insertResult.error?.message ?? "The Concierge quota ledger could not be created.",
  );
}

async function pruneExpiredConciergeQuotaMarkers(
  conversationId: string,
  cutoff: string,
) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("concierge_messages")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .eq("content", CONCIERGE_QUOTA_MARKER_CONTENT)
    .lt("created_at", cutoff);

  if (error) {
    // Pruning is best-effort. Counts always include an explicit time boundary,
    // so a cleanup failure cannot let a request bypass either quota.
    console.error("Unable to prune expired Concierge quota markers", {
      conversationId,
      code: error.code,
    });
  }
}

async function countConciergeQuotaMarkersSince(
  conversationId: string,
  since: string,
) {
  const admin = createSupabaseServiceRoleClient();
  const { count, error } = await admin
    .from("concierge_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .eq("content", CONCIERGE_QUOTA_MARKER_CONTENT)
    .gte("created_at", since);

  if (error || count === null) {
    throw new Error(error?.message ?? "Concierge quota count was unavailable.");
  }

  return count;
}

export async function createConciergeQuotaMarker(
  profileId: string,
): Promise<ConciergeQuotaMarker> {
  const ledger = await getOrCreateConciergeQuotaLedger(profileId);
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("concierge_messages")
    .insert({
      conversation_id: ledger.id,
      role: "user",
      content: CONCIERGE_QUOTA_MARKER_CONTENT,
    })
    .select("id,conversation_id")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Concierge quota reservation was unavailable.");
  }

  return {
    id: data.id,
    conversationId: data.conversation_id,
  };
}

export async function deleteConciergeQuotaMarker(
  profileId: string,
  marker: ConciergeQuotaMarker,
) {
  const ledgerId = getConciergeQuotaLedgerId(profileId);

  if (marker.conversationId !== ledgerId) {
    return false;
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("concierge_messages")
    .delete()
    .eq("id", marker.id)
    .eq("conversation_id", ledgerId)
    .eq("role", "user")
    .eq("content", CONCIERGE_QUOTA_MARKER_CONTENT);

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function getConciergeQuotaSnapshot(
  profileId: string,
): Promise<ConciergeQuotaSnapshot> {
  const now = Date.now();
  const burstSince = new Date(now - BURST_WINDOW_MS).toISOString();
  const dailySince = new Date(now - DAILY_WINDOW_MS).toISOString();
  const ledger = await getOrCreateConciergeQuotaLedger(profileId);

  await pruneExpiredConciergeQuotaMarkers(ledger.id, dailySince);

  const [burstCount, dailyCount] = await Promise.all([
    countConciergeQuotaMarkersSince(ledger.id, burstSince),
    countConciergeQuotaMarkersSince(ledger.id, dailySince),
  ]);
  const burstBlocked = burstCount >= CONCIERGE_BURST_LIMIT;
  const dailyBlocked = dailyCount >= CONCIERGE_DAILY_LIMIT;

  return {
    burstCount,
    dailyCount,
    allowed: !burstBlocked && !dailyBlocked,
    retryAfterSeconds: dailyBlocked
      ? Math.ceil(DAILY_WINDOW_MS / 1000)
      : burstBlocked
        ? Math.ceil(BURST_WINDOW_MS / 1000)
        : 0,
  };
}

export async function withConciergeProfileLock<T>(
  profileId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = profileLocks.get(profileId) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const queued = previous.then(() => current);

  profileLocks.set(profileId, queued);
  await previous;

  try {
    return await operation();
  } finally {
    releaseCurrent();

    if (profileLocks.get(profileId) === queued) {
      profileLocks.delete(profileId);
    }
  }
}
