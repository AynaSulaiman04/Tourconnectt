import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { normalizeProfileImageSource } from "@/lib/supabase/profile-image";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import {
  deriveConciergeConversationTitle,
  getConciergeConversationMessages,
  getConciergeConversationById,
  getOrCreateConciergeConversation,
  createConciergeConversation,
  deleteConciergeConversation,
  saveConciergeMessage,
  updateConciergeConversationTitle,
} from "@/lib/ai/concierge-store";
import { isConciergeQuotaLedgerId } from "@/lib/ai/concierge-hidden";
import { buildConciergeContext } from "@/lib/ai/concierge-context";
import { generateConciergeReply } from "@/lib/ai/concierge";
import {
  CONCIERGE_BURST_LIMIT,
  CONCIERGE_DAILY_LIMIT,
  createConciergeQuotaMarker,
  deleteConciergeQuotaMarker,
  getConciergeQuotaSnapshot,
  withConciergeProfileLock,
} from "@/lib/ai/concierge-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

function conciergeRateLimitResponse(
  quota: Awaited<ReturnType<typeof getConciergeQuotaSnapshot>>,
) {
  return NextResponse.json(
    {
      ok: false,
      error: "You have reached the current Concierge request limit. Please try again later.",
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(Math.max(quota.retryAfterSeconds, 1)),
        "X-RateLimit-Limit": `${CONCIERGE_BURST_LIMIT};w=600, ${CONCIERGE_DAILY_LIMIT};w=86400`,
        "X-RateLimit-Remaining": String(
          Math.max(
            Math.min(
              CONCIERGE_BURST_LIMIT - quota.burstCount,
              CONCIERGE_DAILY_LIMIT - quota.dailyCount,
            ),
            0,
          ),
        ),
      },
    },
  );
}

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

  if (profile) {
    if (!profile.is_active) {
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

  const { error: upsertError } = await admin.from("profiles").upsert(
    {
      id: authData.user.id,
      email: authData.user.email ?? "",
      full_name:
        typeof authData.user.user_metadata?.full_name === "string" &&
        authData.user.user_metadata.full_name.trim().length > 0
          ? authData.user.user_metadata.full_name.trim()
          : (authData.user.email ?? "Traveler").split("@")[0],
      preferred_inquiry_area: null,
      role: "traveler",
      is_active: true,
      status_reason: null,
    },
    { onConflict: "id" },
  );

  if (upsertError) {
    return null;
  }

  const { data: createdProfile } = await admin
    .from("profiles")
    .select(
      "id,email,full_name,preferred_inquiry_area,role,is_active,status_reason,last_seen_at,created_at,updated_at,avatar_base64,profile_image_url",
    )
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!createdProfile?.is_active) {
    return null;
  }

  return {
    authUser: authData.user,
    profile: {
      ...createdProfile,
      profile_image_url:
        normalizeProfileImageSource(createdProfile.avatar_base64) ??
        normalizeProfileImageSource(createdProfile.profile_image_url) ??
        null,
    } as TravelerProfile,
  };
}

export async function POST(request: NextRequest) {
  try {
    let profileContext = await getOptionalCurrentUserProfile();

    if (!profileContext?.profile) {
      profileContext = await getProfileFromBearerToken(request);
    }

    if (!profileContext?.profile) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please sign in to use Concierge AI.",
        },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          message?: string;
          conversationId?: string | null;
          action?: string | null;
        }
      | null;

    const message = body?.message?.trim() ?? "";
    const requestedConversationId = body?.conversationId?.trim() ?? null;
    const action = body?.action?.trim() ?? null;

    if (action === "new" || action === "clear" || action === "refresh_suggestions") {
      if (
        action === "clear" &&
        requestedConversationId &&
        isConciergeQuotaLedgerId(requestedConversationId, profileContext.profile.id)
      ) {
        return NextResponse.json(
          { ok: false, error: "That internal conversation cannot be cleared." },
          { status: 400 },
        );
      }

      if (action === "refresh_suggestions") {
        const activeConversation =
          requestedConversationId && profileContext.profile
            ? await getConciergeConversationById(requestedConversationId, profileContext.profile.id)
            : null;

        if (!activeConversation) {
          return NextResponse.json(
            { ok: false, error: "Start a conversation before refreshing suggestions." },
            { status: 400 },
          );
        }

        const latestUserMessage = await createSupabaseServiceRoleClient()
          .from("concierge_messages")
          .select("content")
          .eq("conversation_id", activeConversation.id)
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const refreshContext = await buildConciergeContext({
          query: latestUserMessage.data?.content?.trim() ?? "",
          userId: profileContext.profile.id,
        });

        return NextResponse.json(
          {
            ok: true,
            conversationId: activeConversation.id,
            conversationTitle: activeConversation.title,
            recommendations: refreshContext.recommendations,
            sources: refreshContext.sourceSummaries,
            persistenceMode: "supabase",
          },
          { status: 200 },
        );
      }

      let conversation = null;

      if (action === "clear" && requestedConversationId) {
        const ownedConversation = await getConciergeConversationById(requestedConversationId, profileContext.profile.id);

        if (ownedConversation) {
          await deleteConciergeConversation({
            conversationId: ownedConversation.id,
            userId: profileContext.profile.id,
          });
        }
      }

      conversation = await createConciergeConversation(profileContext.profile.id, null);

      if (!conversation) {
        return NextResponse.json(
          {
            ok: false,
            error: "We could not start a new concierge chat right now.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json(
        {
          ok: true,
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          persistenceMode: "supabase",
          messages: [],
          recommendations: [],
          sources: [],
        },
        { status: 200 },
      );
    }

    if (!message) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please enter a message before sending.",
        },
        { status: 400 },
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    const reservation = await withConciergeProfileLock(
      profileContext.profile.id,
      async () => {
        const quotaBeforeReservation = await getConciergeQuotaSnapshot(
          profileContext.profile.id,
        );

        if (!quotaBeforeReservation.allowed) {
          return {
            ok: false as const,
            reason: "rate_limit" as const,
            quota: quotaBeforeReservation,
          };
        }

        const conversation = await getOrCreateConciergeConversation({
          userId: profileContext.profile.id,
          conversationId: requestedConversationId,
          title: deriveConciergeConversationTitle(message),
        });

        if (!conversation) {
          return {
            ok: false as const,
            reason: "storage" as const,
          };
        }

        const historyMessages = await getConciergeConversationMessages({
          conversationId: conversation.id,
          userId: profileContext.profile.id,
          limit: 10,
        });
        const quotaMarker = await createConciergeQuotaMarker(
          profileContext.profile.id,
        );
        let markerReleased = false;
        const releaseQuotaMarker = async () => {
          if (markerReleased) {
            return;
          }

          try {
            await deleteConciergeQuotaMarker(
              profileContext.profile.id,
              quotaMarker,
            );
            markerReleased = true;
          } catch (deleteError) {
            console.error("Unable to release a Concierge quota reservation", {
              profileId: profileContext.profile.id,
              markerId: quotaMarker.id,
              error: deleteError,
            });
          }
        };

        try {
          // The hidden persisted marker is the cross-worker reservation.
          // Recount before any visible chat write or provider invocation.
          const quotaAfterReservation = await getConciergeQuotaSnapshot(
            profileContext.profile.id,
          );
          const reservationExceededQuota =
            quotaAfterReservation.burstCount > CONCIERGE_BURST_LIMIT ||
            quotaAfterReservation.dailyCount > CONCIERGE_DAILY_LIMIT;

          if (reservationExceededQuota) {
            await releaseQuotaMarker();

            return {
              ok: false as const,
              reason: "rate_limit" as const,
              quota: quotaAfterReservation,
            };
          }

          const userMessage = await saveConciergeMessage({
            conversationId: conversation.id,
            role: "user",
            content: message,
          });

          if (!userMessage) {
            await releaseQuotaMarker();

            return {
              ok: false as const,
              reason: "storage" as const,
            };
          }

          if (!conversation.title) {
            await updateConciergeConversationTitle({
              conversationId: conversation.id,
              userId: profileContext.profile.id,
              title: deriveConciergeConversationTitle(message),
            });
          }

          return {
            ok: true as const,
            conversation,
            historyMessages,
            quotaMarker,
          };
        } catch (error) {
          await releaseQuotaMarker();
          throw error;
        }
      },
    );

    if (!reservation.ok) {
      if (reservation.reason === "rate_limit") {
        return conciergeRateLimitResponse(reservation.quota);
      }

      return NextResponse.json(
        {
          ok: false,
          error: "Concierge chat storage is temporarily unavailable. Please try again later.",
        },
        { status: 503 },
      );
    }

    const { conversation, historyMessages, quotaMarker } = reservation;
    const activeConversationId = conversation.id;
    let reply;

    try {
      reply = await generateConciergeReply({
        message,
        userId: profileContext.profile.id,
        historyMessages: historyMessages.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
      });
    } catch (error) {
      // generateConciergeReply catches provider errors itself. A thrown error
      // here occurred before the provider attempt (for example context
      // storage), so do not charge the durable quota marker.
      await deleteConciergeQuotaMarker(
        profileContext.profile.id,
        quotaMarker,
      ).catch((deleteError) => {
        console.error("Unable to release a pre-provider Concierge quota marker", {
          profileId: profileContext.profile.id,
          markerId: quotaMarker.id,
          error: deleteError,
        });
      });
      throw error;
    }

    if (reply.configurationError) {
      await deleteConciergeQuotaMarker(
        profileContext.profile.id,
        quotaMarker,
      ).catch((deleteError) => {
        console.error("Unable to release an unconfigured Concierge quota marker", {
          profileId: profileContext.profile.id,
          markerId: quotaMarker.id,
          error: deleteError,
        });
      });
    }

    if (!reply.ok) {
      const failureStatus = reply.statusCode ?? (reply.configurationError ? 503 : 500);

      return NextResponse.json(
        {
          ok: false,
          conversationId: activeConversationId,
          error:
            failureStatus >= 500
              ? "Concierge AI is temporarily unavailable. Please try again later."
              : reply.configurationError ?? reply.error ?? "Unable to generate a concierge response.",
          recommendations: reply.recommendations ?? [],
          sources: reply.sources ?? [],
          persistenceMode: "supabase",
          storageWarning: null,
        },
        { status: failureStatus },
      );
    }

    const assistantMessage = await saveConciergeMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: reply.assistantText ?? "",
      sources: reply.sources ?? [],
    });

    return NextResponse.json(
      {
        ok: true,
        conversationId: activeConversationId,
        conversationTitle: conversation.title ?? deriveConciergeConversationTitle(message),
        persistenceMode: "supabase",
        storageWarning: null,
        assistantMessage: assistantMessage
          ? {
              id: assistantMessage.id,
              role: assistantMessage.role,
              content: assistantMessage.content,
              sources: assistantMessage.sources ?? [],
              created_at: assistantMessage.created_at,
            }
          : {
              role: "assistant",
              content: reply.assistantText,
              sources: reply.sources ?? [],
            },
        recommendations: reply.recommendations ?? [],
        tripIntentSummary: reply.context?.tripIntentSummary ?? null,
        itineraryDraft: reply.itineraryDraft ?? [],
        sources: reply.sources ?? [],
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Concierge chat error", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Concierge AI is temporarily unavailable. Please try again later.",
      },
      { status: 500 },
    );
  }
}
