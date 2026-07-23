import { lookup } from "node:dns/promises";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!configuredUrl) {
    return NextResponse.json(
      { ok: false, error: "Google sign-in is not configured." },
      { status: 503 },
    );
  }

  try {
    const hostname = new URL(configuredUrl).hostname;
    await Promise.race([
      lookup(hostname),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Supabase lookup timed out.")), 3000),
      ),
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Google sign-in is temporarily unavailable because the authentication service cannot be reached.",
      },
      { status: 503 },
    );
  }
}
