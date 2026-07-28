import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getRoleDashboardRoute } from "@/lib/supabase/role-route";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function redirectWithSessionCookies(target: URL, sessionResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(target);

  for (const cookie of sessionResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }

  return redirectResponse;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNextPath = url.searchParams.get("next") ?? "";
  const nextPath =
    requestedNextPath.startsWith("/") && !requestedNextPath.startsWith("//")
      ? requestedNextPath
      : "/TravellerProfile";
  const response = NextResponse.redirect(new URL(nextPath, request.url));

  if (!code) {
    return NextResponse.redirect(new URL("/LoginPage", request.url));
  }

  const supabase = createServerClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const fallbackUrl = new URL("/LoginPage", request.url);
    fallbackUrl.searchParams.set("auth", "error");
    return NextResponse.redirect(fallbackUrl);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const authUser = userData.user;

  if (userError || !authUser) {
    const failedUrl = new URL("/LoginPage", request.url);
    failedUrl.searchParams.set("auth", "error");
    return redirectWithSessionCookies(failedUrl, response);
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,is_active,status_reason")
    .eq("id", authUser.id)
    .maybeSingle();

  const hasValidRole =
    profile?.role === "traveler" ||
    profile?.role === "operator" ||
    profile?.role === "admin";

  if (profileError || !profile || !hasValidRole) {
    console.error("Unable to verify OAuth profile", {
      userId: authUser.id,
      code: profileError?.code,
    });
    await supabase.auth.signOut();
    const failedUrl = new URL("/LoginPage", request.url);
    failedUrl.searchParams.set("auth", "error");
    return redirectWithSessionCookies(failedUrl, response);
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    const inactiveUrl = new URL("/LoginPage", request.url);
    inactiveUrl.searchParams.set("auth", "inactive");
    if (profile.status_reason) {
      inactiveUrl.searchParams.set("reason", profile.status_reason);
    }
    return redirectWithSessionCookies(inactiveUrl, response);
  }

  const destination =
    nextPath === "/LoginPage?mode=recovery"
      ? nextPath
      : getRoleDashboardRoute(profile.role);

  return redirectWithSessionCookies(new URL(destination, request.url), response);
}
