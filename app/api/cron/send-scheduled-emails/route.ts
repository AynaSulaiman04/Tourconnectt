import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { processScheduledEmails } from "@/lib/email/scheduled";

function getExpectedSecret() {
  return process.env.CRON_SECRET?.trim() ?? "";
}

function getProvidedSecrets(request: Request) {
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

function authorizeCronRequest(request: Request) {
  const expectedSecret = getExpectedSecret();
  const providedSecrets = getProvidedSecrets(request);

  if (
    !expectedSecret ||
    !providedSecrets.some((providedSecret) => secretsMatch(providedSecret, expectedSecret))
  ) {
    return false;
  }

  return true;
}

async function handleRequest(request: Request) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized cron request.",
      },
      { status: 401 },
    );
  }

  try {
    const summary = await processScheduledEmails();
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error("Scheduled email cron failed", error);

    return NextResponse.json(
      {
        ok: false,
        remindersSent: 0,
        preTourSent: 0,
        reviewRequestsSent: 0,
        skipped: 0,
        errors: ["Unable to process scheduled emails right now."],
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
