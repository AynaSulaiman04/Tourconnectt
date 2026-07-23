import { NextResponse } from "next/server";
import { processScheduledEmails } from "@/lib/email/scheduled";

function getExpectedSecret() {
  return process.env.CRON_SECRET?.trim() ?? "";
}

function getProvidedSecret(request: Request) {
  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret")?.trim() ?? "";

  return headerSecret || querySecret;
}

function authorizeCronRequest(request: Request) {
  const expectedSecret = getExpectedSecret();
  const providedSecret = getProvidedSecret(request);

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
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
