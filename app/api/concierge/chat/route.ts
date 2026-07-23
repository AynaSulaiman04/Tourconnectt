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
import { buildConciergeContext } from "@/lib/ai/concierge-context";
import { generateConciergeReply } from "@/lib/ai/concierge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

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

  const { data: authData } = await supabase.auth.getUser(accessToken);

  if (!authData.user) {
    return null;
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id,email,full_name,preferred_inquiry_area,role,created_at,updated_at,avatar_base64,profile_image_url")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profile) {
    return {
      authUser: {
        id: authData.user.id,
        email: authData.user.email ?? null,
        user_metadata: authData.user.user_metadata ?? {},
      },
      profile: {
        ...profile,
        is_active: true,
        status_reason: null,
        last_seen_at: null,
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
      role:
        authData.user.user_metadata?.role === "operator" || authData.user.user_metadata?.role === "admin"
          ? authData.user.user_metadata.role
          : "traveler",
    },
    { onConflict: "id" },
  );

  if (upsertError) {
    return null;
  }

  const { data: createdProfile } = await admin
    .from("profiles")
    .select("id,email,full_name,preferred_inquiry_area,role,created_at,updated_at,avatar_base64,profile_image_url")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!createdProfile) {
    return null;
  }

  return {
    authUser: {
      id: authData.user.id,
      email: authData.user.email ?? null,
      user_metadata: authData.user.user_metadata ?? {},
    },
    profile: {
      ...createdProfile,
      is_active: true,
      status_reason: null,
      last_seen_at: null,
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

    const conversation = await getOrCreateConciergeConversation({
      userId: profileContext.profile.id,
      conversationId: requestedConversationId,
      title: deriveConciergeConversationTitle(message),
    });

    const storageAvailable = Boolean(conversation);
    const activeConversationId =
      conversation?.id ?? requestedConversationId ?? `session-${profileContext.profile.id}-${Date.now()}`;
    const historyMessages = storageAvailable
      ? await getConciergeConversationMessages({
          conversationId: conversation!.id,
          userId: profileContext.profile.id,
          limit: 10,
        })
      : [];

    if (storageAvailable) {
      await saveConciergeMessage({
        conversationId: conversation!.id,
        role: "user",
        content: message,
      });

      if (!conversation!.title) {
        await updateConciergeConversationTitle({
          conversationId: conversation!.id,
          userId: profileContext.profile.id,
          title: deriveConciergeConversationTitle(message),
        });
      }
    }

    const reply = await generateConciergeReply({
      message,
      userId: profileContext.profile.id,
      historyMessages: historyMessages.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
    });

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
          persistenceMode: storageAvailable ? "supabase" : "client-only",
          storageWarning: storageAvailable
            ? null
            : "Concierge chat storage is not available yet. Using session-only history until the migration is applied.",
        },
        { status: failureStatus },
      );
    }

    const assistantMessage = storageAvailable
      ? await saveConciergeMessage({
          conversationId: conversation!.id,
          role: "assistant",
          content: reply.assistantText ?? "",
          sources: reply.sources ?? [],
        })
      : null;

    return NextResponse.json(
      {
        ok: true,
        conversationId: activeConversationId,
        conversationTitle: conversation?.title ?? deriveConciergeConversationTitle(message),
        persistenceMode: storageAvailable ? "supabase" : "client-only",
        storageWarning: storageAvailable
          ? null
          : "Concierge chat storage is not available yet. Using session-only history until the migration is applied.",
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
