import "server-only";

import { createSupabaseServiceRoleClient } from "./server";

export type PlatformNotificationRecord = {
  id: string;
  recipient_profile_id: string;
  actor_profile_id: string | null;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

type PlatformNotificationPayload = {
  recipientProfileId: string;
  actorProfileId?: string | null;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

function isMissingRelationOrColumnError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "42703" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("Could not find the relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

async function insertPlatformNotification(payload: PlatformNotificationPayload) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("platform_notifications").insert({
    recipient_profile_id: payload.recipientProfileId,
    actor_profile_id: payload.actorProfileId ?? null,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    href: payload.href ?? null,
    entity_type: payload.entityType ?? null,
    entity_id: payload.entityId ?? null,
    metadata: payload.metadata ?? {},
  });

  if (error && !isMissingRelationOrColumnError(error)) {
    throw new Error(error.message);
  }
}

export async function recordPlatformNotification(payload: PlatformNotificationPayload) {
  await insertPlatformNotification(payload);
}

async function getAdminRecipientProfileIds(excludeProfileId?: string | null) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true);

  if (error) {
    if (isMissingRelationOrColumnError(error)) {
      return [] as string[];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{ id: string }>)
    .map((profile) => profile.id)
    .filter((profileId) => profileId !== excludeProfileId);
}

export async function recordAdminNotifications(
  payload: Omit<PlatformNotificationPayload, "recipientProfileId"> & { excludeProfileId?: string | null },
) {
  const recipientProfileIds = await getAdminRecipientProfileIds(payload.excludeProfileId);

  if (!recipientProfileIds.length) {
    return;
  }

  await Promise.all(
    recipientProfileIds.map((recipientProfileId) =>
      insertPlatformNotification({
        recipientProfileId,
        actorProfileId: payload.actorProfileId ?? null,
        kind: payload.kind,
        title: payload.title,
        body: payload.body,
        href: payload.href ?? null,
        entityType: payload.entityType ?? null,
        entityId: payload.entityId ?? null,
        metadata: payload.metadata ?? {},
      }),
    ),
  );
}

export async function getRecentPlatformNotifications(recipientProfileId: string, limit = 6) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("platform_notifications")
    .select("id,recipient_profile_id,actor_profile_id,kind,title,body,href,entity_type,entity_id,metadata,read_at,created_at")
    .eq("recipient_profile_id", recipientProfileId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelationOrColumnError(error)) {
      return [] as PlatformNotificationRecord[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as PlatformNotificationRecord[];
}

export async function countUnreadPlatformNotifications(recipientProfileId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { count, error } = await admin
    .from("platform_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_profile_id", recipientProfileId)
    .is("read_at", null);

  if (error) {
    if (isMissingRelationOrColumnError(error)) {
      return 0;
    }

    throw new Error(error.message);
  }

  return count ?? 0;
}
