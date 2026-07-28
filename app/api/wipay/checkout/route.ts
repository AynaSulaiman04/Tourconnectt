import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compatibility shim for older checkout forms. A 307 keeps the POST body
 * intact while routing every payment start through the single hardened flow.
 */
export async function POST(request: NextRequest) {
  return NextResponse.redirect(new URL("/api/payments/wipay/start", request.url), 307);
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}
