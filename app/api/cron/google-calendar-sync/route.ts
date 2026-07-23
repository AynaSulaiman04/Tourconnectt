import { NextRequest, NextResponse } from "next/server";
import { processGoogleCalendarSync } from "@/lib/calendar/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCronSecret(request: NextRequest) {
  return (
    request.headers.get("x-cron-secret")?.trim() ||
    request.nextUrl.searchParams.get("secret")?.trim() ||
    null
  );
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 401 });
  }

  if (getCronSecret(request) !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await processGoogleCalendarSync();
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error("Google Calendar cron sync failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to run Google Calendar sync right now.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
