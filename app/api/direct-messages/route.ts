import { NextRequest, NextResponse } from "next/server";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { getDirectMessagePageState, sendDirectMessage } from "@/lib/supabase/direct-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

function getParam(value: string | null) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

export async function GET(request: NextRequest) {
  try {
    const profileContext = await getOptionalCurrentUserProfile();

    if (!profileContext?.profile) {
      return NextResponse.json({ ok: false, error: "Please sign in to view direct messages." }, { status: 401 });
    }

    if (!["traveler", "operator"].includes(profileContext.profile.role)) {
      return NextResponse.json(
        { ok: false, error: "Direct messages are available to travelers and operators only." },
        { status: 403 },
      );
    }

    const profile = profileContext.profile;
    const searchParams = request.nextUrl.searchParams;

    const state = await getDirectMessagePageState({
      profile,
      role: profile.role as "traveler" | "operator",
      conversationId: getParam(searchParams.get("conversation")),
      listingId: getParam(searchParams.get("listing")),
      inquiryId: getParam(searchParams.get("inquiry")),
      markAsSeen: true,
    });

    return NextResponse.json({ ok: true, ...state }, { status: 200 });
  } catch (error) {
    console.error("Direct message state error", error);

    return NextResponse.json(
      {
        ok: false,
        error: "We could not load direct messages right now.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const profileContext = await getOptionalCurrentUserProfile();

    if (!profileContext?.profile) {
      return NextResponse.json(
        { ok: false, error: "Please sign in to message the operator." },
        { status: 401 },
      );
    }

    if (!["traveler", "operator"].includes(profileContext.profile.role)) {
      return NextResponse.json(
        { ok: false, error: "Direct messages are available to travelers and operators only." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          message?: string;
          conversationId?: string | null;
          listingId?: string | null;
          inquiryId?: string | null;
        }
      | null;

    const message = body?.message?.trim() ?? "";
    const conversationId = body?.conversationId?.trim() ?? null;
    const listingId = body?.listingId?.trim() ?? null;
    const inquiryId = body?.inquiryId?.trim() ?? null;

    if (!message) {
      return NextResponse.json({ ok: false, error: "Please enter a message before sending." }, { status: 400 });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 },
      );
    }

    if (profileContext.profile.role === "operator" && !conversationId) {
      return NextResponse.json(
        { ok: false, error: "Operators can reply from an existing conversation only." },
        { status: 400 },
      );
    }

    if (profileContext.profile.role === "traveler" && !conversationId && !listingId && !inquiryId) {
      return NextResponse.json(
        { ok: false, error: "Choose a listing or inquiry before starting a message." },
        { status: 400 },
      );
    }

    const payload = await sendDirectMessage({
      profile: profileContext.profile,
      role: profileContext.profile.role as "traveler" | "operator",
      message,
      conversationId,
      listingId,
      inquiryId,
    });

    return NextResponse.json({ ok: true, ...payload }, { status: 200 });
  } catch (error) {
    console.error("Direct message error", error);

    return NextResponse.json(
      {
        ok: false,
        error: "We could not send your message right now.",
      },
      { status: 500 },
    );
  }
}
