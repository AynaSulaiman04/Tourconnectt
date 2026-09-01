import "server-only";

import crypto from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const BURST_WINDOW_MS = 60 * 60 * 1000;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Messages one guest IP may send per hour. */
export const CONCIERGE_GUEST_HOURLY_LIMIT = 10;
/** Messages one guest IP may send per day. */
export const CONCIERGE_GUEST_DAILY_LIMIT = 40;

export type ConciergeGuestQuota = {
  hourlyCount: number;
  dailyCount: number;
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

/**
 * Trusted proxy headers only. Vercel sets `x-forwarded-for`; Cloudflare sets
 * `cf-connecting-ip`. A request with no usable address is bucketed under a
 * single shared key so it cannot escape the quota by omitting headers.
 */
export function resolveClientIp(headers: Headers) {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();

    if (value) {
      return value;
    }
  }

  return "unknown";
}

/**
 * Hash the address so the ledger never holds a raw IP. The salt falls back to
 * the service role key, which is already required for this table's writes, so
 * a missing CONCIERGE_IP_SALT cannot silently reduce the digest to a plain
 * hash of a small address space.
 */
function hashClientIp(ip: string) {
  const salt =
    process.env.CONCIERGE_IP_SALT?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "tt-connect-concierge";

  return crypto.createHmac("sha256", salt).update(ip, "utf8").digest("hex");
}

export function getConciergeGuestKey(headers: Headers) {
  return hashClientIp(resolveClientIp(headers));
}

async function countGuestRequestsSince(ipHash: string, since: string) {
  const admin = createSupabaseServiceRoleClient();
  const { count, error } = await admin
    .from("concierge_guest_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if (error || count === null) {
    throw new Error(error?.message ?? "Guest Concierge quota count was unavailable.");
  }

  return count;
}

async function pruneExpiredGuestRequests(cutoff: string) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("concierge_guest_requests").delete().lt("created_at", cutoff);

  if (error) {
    // Pruning is best-effort. Every count carries an explicit time boundary, so
    // a failed cleanup can never let a request slip past the quota.
    console.error("Unable to prune expired guest Concierge requests", { code: error.code });
  }
}

export async function getConciergeGuestQuota(ipHash: string): Promise<ConciergeGuestQuota> {
  const now = Date.now();
  const hourlySince = new Date(now - BURST_WINDOW_MS).toISOString();
  const dailySince = new Date(now - DAILY_WINDOW_MS).toISOString();

  await pruneExpiredGuestRequests(dailySince);

  const [hourlyCount, dailyCount] = await Promise.all([
    countGuestRequestsSince(ipHash, hourlySince),
    countGuestRequestsSince(ipHash, dailySince),
  ]);

  const hourlyBlocked = hourlyCount >= CONCIERGE_GUEST_HOURLY_LIMIT;
  const dailyBlocked = dailyCount >= CONCIERGE_GUEST_DAILY_LIMIT;

  return {
    hourlyCount,
    dailyCount,
    allowed: !hourlyBlocked && !dailyBlocked,
    remaining: Math.max(
      Math.min(
        CONCIERGE_GUEST_HOURLY_LIMIT - hourlyCount,
        CONCIERGE_GUEST_DAILY_LIMIT - dailyCount,
      ),
      0,
    ),
    retryAfterSeconds: dailyBlocked
      ? Math.ceil(DAILY_WINDOW_MS / 1000)
      : hourlyBlocked
        ? Math.ceil(BURST_WINDOW_MS / 1000)
        : 0,
  };
}

/**
 * Reserves one guest request before the provider is called, mirroring the
 * signed-in flow: the row is the reservation, and it is released if the reply
 * never happened so a failed attempt does not consume the visitor's quota.
 */
export async function reserveConciergeGuestRequest(ipHash: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("concierge_guest_requests")
    .insert({ ip_hash: ipHash })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Guest Concierge reservation was unavailable.");
  }

  return data.id as string;
}

export async function releaseConciergeGuestRequest(reservationId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("concierge_guest_requests").delete().eq("id", reservationId);

  if (error) {
    console.error("Unable to release a guest Concierge reservation", { code: error.code });
  }
}
