import { NextResponse } from "next/server";
import { PORTAL_AUTH_COOKIE_NAME } from "@/lib/supabase/portal-auth";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

async function createSessionResponse(options: { optional: boolean }) {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext) {
    const response = NextResponse.json(
      options.optional
        ? { ok: true, authenticated: false, profile: null }
        : { ok: false, authenticated: false, error: "No active authenticated session." },
      { status: options.optional ? 200 : 401 },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const { profile } = profileContext;
  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      profile_image_url: profile.profile_image_url,
      role: profile.role,
    },
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
}

export async function GET() {
  return createSessionResponse({ optional: true });
}

export async function POST() {
  return createSessionResponse({ optional: false });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PORTAL_AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
