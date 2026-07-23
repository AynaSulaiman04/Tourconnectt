import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { getGoogleCalendarConfigStatus, getGoogleOAuthClient } from "@/lib/calendar/google";

const OAUTH_STATE_COOKIE = "ttc-google-calendar-state";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile) {
    return NextResponse.redirect(new URL("/LoginPage", request.url));
  }

  if (profileContext.profile.role !== "operator") {
    return NextResponse.redirect(new URL(getRoleDashboardRoute(profileContext.profile.role), request.url));
  }

  const configStatus = getGoogleCalendarConfigStatus();

  if (!configStatus.configured) {
    return NextResponse.redirect(
      new URL(`/OperatorSettings?calendar_error=${encodeURIComponent(configStatus.message)}`, request.url),
    );
  }

  try {
    const oauth2Client = getGoogleOAuthClient();
    const state = crypto.randomBytes(32).toString("hex");

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      prompt: "consent",
      scope: [GOOGLE_SCOPE],
      state,
    });

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    console.error("Unable to start Google Calendar connect flow", error);
    return NextResponse.redirect(
      new URL(
        `/OperatorSettings?calendar_error=${encodeURIComponent("Google Calendar is not configured yet.")}`,
        request.url,
      ),
    );
  }
}
