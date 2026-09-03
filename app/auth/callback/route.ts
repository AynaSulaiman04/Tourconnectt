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

/**
 * Google and Supabase report a refused or misconfigured sign-in as query
 * parameters on this callback, not as an exception. Turn the raw provider text
 * into something a visitor can act on, and keep the original for the logs.
 */
function describeOAuthError(error: string, description: string) {
  const haystack = `${error} ${description}`.toLowerCase();

  // Ordered most specific first. Google sends the configuration and policy
  // failures alongside a generic `access_denied`, so matching that first would
  // tell an administrator their setup was fine and the user simply cancelled.
  if (haystack.includes("redirect_uri") || haystack.includes("redirect uri")) {
    return "Google sign-in is misconfigured for this site address. An administrator needs to add this site's callback URL to the Google OAuth client.";
  }

  if (
    haystack.includes("admin_policy") ||
    haystack.includes("org_internal") ||
    haystack.includes("blocked") ||
    haystack.includes("has not completed the google verification")
  ) {
    return "Google has blocked sign-in for this app. An administrator needs to publish the Google consent screen or add this account as a test user.";
  }

  if (haystack.includes("provider is not enabled") || haystack.includes("unsupported provider")) {
    return "Google sign-in is not enabled for this site yet. Use your email and password, or ask an administrator to enable it.";
  }

  if (haystack.includes("deleted_client") || haystack.includes("invalid_client")) {
    return "The Google sign-in credentials for this site are no longer valid. An administrator needs to update them.";
  }

  if (haystack.includes("bad_oauth_state") || haystack.includes("state")) {
    return "That Google sign-in attempt expired. Please start again.";
  }

  if (haystack.includes("access_denied") || haystack.includes("consent")) {
    return "Google sign-in was cancelled before it finished. Try again, or use your email and password.";
  }

  return description.trim() || "We could not complete Google sign-in. Please try again.";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error") ?? url.searchParams.get("error_code") ?? "";
  const providerErrorDescription = url.searchParams.get("error_description") ?? "";
  const requestedNextPath = url.searchParams.get("next") ?? "";
  const nextPath =
    requestedNextPath.startsWith("/") && !requestedNextPath.startsWith("//")
      ? requestedNextPath
      : "/TravellerProfile";
  const response = NextResponse.redirect(new URL(nextPath, request.url));

  // A refused or misconfigured provider sign-in arrives here with no code and an
  // error in the query string. This used to fall into the branch below and drop
  // the visitor on a bare login page with nothing to explain what happened.
  if (providerError || providerErrorDescription) {
    console.error("OAuth provider returned an error", {
      error: providerError,
      description: providerErrorDescription,
    });

    const failedUrl = new URL("/LoginPage", request.url);
    failedUrl.searchParams.set("auth", "error");
    failedUrl.searchParams.set("reason", describeOAuthError(providerError, providerErrorDescription));
    return NextResponse.redirect(failedUrl);
  }

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
  const { data: existingProfile, error: profileError } = await admin
    .from("profiles")
    .select("role,is_active,status_reason")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileError) {
    console.error("Unable to read the profile for an OAuth sign-in", {
      userId: authUser.id,
      code: profileError.code,
    });
    await supabase.auth.signOut();
    const failedUrl = new URL("/LoginPage", request.url);
    failedUrl.searchParams.set("auth", "error");
    failedUrl.searchParams.set("reason", "We could not load your account profile. Please try again.");
    return redirectWithSessionCookies(failedUrl, response);
  }

  let profile = existingProfile;

  // A first sign-in through Google creates the auth user but the profile comes
  // from a database trigger. If that row is missing for any reason this used to
  // sign the visitor straight back out with an unexplained error, and every
  // retry did the same — Google sign-up could never complete. Create the row
  // here instead, matching what the trigger and the email signup both write.
  if (!profile) {
    const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const metadataName = ["full_name", "name"]
      .map((key) => (typeof metadata[key] === "string" ? (metadata[key] as string).trim() : ""))
      .find((value) => value.length > 0);

    const { data: createdProfile, error: createProfileError } = await admin
      .from("profiles")
      .upsert(
        {
          id: authUser.id,
          email: authUser.email ?? "",
          full_name: metadataName || (authUser.email ?? "").split("@")[0] || "Traveller",
          preferred_inquiry_area: null,
          role: "traveler",
          is_active: true,
          status_reason: null,
        },
        { onConflict: "id" },
      )
      .select("role,is_active,status_reason")
      .maybeSingle();

    if (createProfileError || !createdProfile) {
      console.error("Unable to create a profile for a first OAuth sign-in", {
        userId: authUser.id,
        code: createProfileError?.code,
      });
      await supabase.auth.signOut();
      const failedUrl = new URL("/LoginPage", request.url);
      failedUrl.searchParams.set("auth", "error");
      failedUrl.searchParams.set("reason", "We could not finish setting up your account. Please try again.");
      return redirectWithSessionCookies(failedUrl, response);
    }

    profile = createdProfile;
  }

  const hasValidRole =
    profile.role === "traveler" || profile.role === "operator" || profile.role === "admin";

  if (!hasValidRole) {
    console.error("OAuth profile has no usable role", { userId: authUser.id, role: profile.role });
    await supabase.auth.signOut();
    const failedUrl = new URL("/LoginPage", request.url);
    failedUrl.searchParams.set("auth", "error");
    failedUrl.searchParams.set("reason", "Your account has no role assigned. Contact an administrator.");
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
