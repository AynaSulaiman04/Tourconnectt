import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { serializePortalAuthCookie } from "@/lib/supabase/portal-auth";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = url.searchParams.get("next") ?? "/TravellerProfile";
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

  const { data: userData } = await supabase.auth.getUser();

  if (userData.user) {
    const fullName =
      typeof userData.user.user_metadata?.full_name === "string" &&
      userData.user.user_metadata.full_name.trim().length > 0
        ? userData.user.user_metadata.full_name.trim()
        : (userData.user.email ?? "Traveler").split("@")[0];

    response.cookies.set(
      "tt-connect-portal-auth",
      serializePortalAuthCookie({
        id: userData.user.id,
        email: userData.user.email ?? "",
        full_name: fullName,
        role:
          userData.user.user_metadata?.role === "operator" ||
          userData.user.user_metadata?.role === "admin"
            ? userData.user.user_metadata.role
            : "traveler",
      }),
      {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    );
  }

  return response;
}
