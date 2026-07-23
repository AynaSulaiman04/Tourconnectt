import { NextRequest, NextResponse } from "next/server";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import {
  getGoogleOAuthClient,
  getOperatorCalendarIntegration,
  upsertGoogleCalendarConnection,
} from "@/lib/calendar/google";

const OAUTH_STATE_COOKIE = "ttc-google-calendar-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithError(request: NextRequest, error: string) {
  return NextResponse.redirect(
    new URL(`/OperatorSettings?calendar_error=${encodeURIComponent(error)}`, request.url),
  );
}

export async function GET(request: NextRequest) {
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile) {
    return NextResponse.redirect(new URL("/LoginPage", request.url));
  }

  if (profileContext.profile.role !== "operator") {
    return NextResponse.redirect(new URL(getRoleDashboardRoute(profileContext.profile.role), request.url));
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  const returnedState = request.nextUrl.searchParams.get("state")?.trim();
  const error = request.nextUrl.searchParams.get("error")?.trim();
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null;

  if (error) {
    return redirectWithError(request, "Google Calendar connection was not completed.");
  }

  if (!code) {
    return redirectWithError(request, "Google Calendar connection was not completed.");
  }

  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return redirectWithError(request, "Google Calendar connection could not be verified.");
  }

  try {
    const oauth2Client = getGoogleOAuthClient();
    const tokenResponse = await oauth2Client.getToken(code);
    const tokens = tokenResponse.tokens;
    const existingIntegration = await getOperatorCalendarIntegration(profileContext.profile.id);

    const refreshToken = tokens.refresh_token ?? existingIntegration?.refresh_token ?? null;

    if (!refreshToken) {
      return redirectWithError(
        request,
        "Google Calendar did not return a refresh token. Please connect again and approve offline access.",
      );
    }

    await upsertGoogleCalendarConnection({
      operatorId: profileContext.profile.id,
      accessToken: tokens.access_token ?? existingIntegration?.access_token ?? null,
      refreshToken,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : existingIntegration?.expires_at ?? null,
      calendarId: existingIntegration?.calendar_id ?? "primary",
      syncToken: existingIntegration?.sync_token ?? null,
    });

    const response = NextResponse.redirect(new URL("/OperatorSettings?calendar=connected", request.url));
    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("Unable to complete Google Calendar connect flow", error);
    return redirectWithError(
      request,
      "Google Calendar connection could not be completed. Please try again.",
    );
  }
}
