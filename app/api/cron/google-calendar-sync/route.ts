import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processGoogleCalendarSync } from "@/lib/calendar/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getProvidedSecrets(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  const bearerSecret = bearerMatch?.[1]?.trim() ?? "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";

  return [bearerSecret, headerSecret].filter(Boolean);
}

function secretsMatch(providedSecret: string, expectedSecret: string) {
  const providedBuffer = Buffer.from(providedSecret, "utf8");
  const expectedBuffer = Buffer.from(expectedSecret, "utf8");

  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 401 });
  }

  if (
    !getProvidedSecrets(request).some((providedSecret) =>
      secretsMatch(providedSecret, cronSecret),
    )
  ) {
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
