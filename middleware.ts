import { NextRequest, NextResponse } from "next/server";
import { PORTAL_AUTH_COOKIE_NAME, readPortalAuthCookieValue } from "@/lib/supabase/portal-auth";

const AUTH_ROUTES = ["/LoginPage", "/SignUp", "/AdminLogin", "/AdminSignUp", "/OperatorLogin", "/OperatorSignUp"];

const PROTECTED_ROUTES: Record<"admin" | "operator" | "traveler", string[]> = {
  admin: [
    "/AdminDashboard",
    "/AdminBookings",
    "/AdminListings",
    "/AdminUsers",
    "/AdminAnalytics",
    "/AdminContent",
    "/AdminPromotions",
    "/AdminSettings",
  ],
  operator: [
    "/OperatorDashboard",
    "/OperatorBookings",
    "/OperatorDocuments",
    "/OperatorListings",
    "/OperatorMessages",
    "/OperatorSettings",
    "/OperatorUserManage",
    "/CreateListing",
  ],
  traveler: ["/TravellerProfile", "/AccountSetting"],
};

function getRoleHome(role: "traveler" | "operator" | "admin") {
  switch (role) {
    case "admin":
      return "/AdminDashboard";
    case "operator":
      return "/OperatorDashboard";
    default:
      return "/TravellerProfile";
  }
}

function pathMatches(pathname: string, candidate: string) {
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

function firstAuthRoute(pathname: string) {
  return AUTH_ROUTES.find((route) => pathMatches(pathname, route)) ?? null;
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((entry) => /^sb-.*-auth-token(\.\d+)?$/.test(entry.name));
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const portalCookie = readPortalAuthCookieValue(request.cookies.get(PORTAL_AUTH_COOKIE_NAME)?.value);
  const hasSupabaseAuth = hasSupabaseSessionCookie(request);
  const authRoute = firstAuthRoute(pathname);
  const isProtectedAdminRoute =
    PROTECTED_ROUTES.admin.some((route) => pathMatches(pathname, route)) && !pathMatches(pathname, "/AdminLogin") && !pathMatches(pathname, "/AdminSignUp");
  const isProtectedOperatorRoute =
    PROTECTED_ROUTES.operator.some((route) => pathMatches(pathname, route)) &&
    !pathMatches(pathname, "/OperatorLogin") &&
    !pathMatches(pathname, "/OperatorSignUp");
  const isProtectedTravelerRoute =
    PROTECTED_ROUTES.traveler.some((route) => pathMatches(pathname, route)) &&
    !pathMatches(pathname, "/LoginPage") &&
    !pathMatches(pathname, "/SignUp");

  if (portalCookie) {
    if (authRoute) {
      return NextResponse.redirect(new URL(getRoleHome(portalCookie.role), request.url));
    }

    const protectedRole =
      Object.entries(PROTECTED_ROUTES).find(([, routes]) => routes.some((route) => pathMatches(pathname, route)))?.[0] as
        | "admin"
        | "operator"
        | "traveler"
        | undefined;

    if (protectedRole && portalCookie.role !== protectedRole) {
      const destination =
        portalCookie.role === "admin"
          ? "/AdminDashboard"
          : portalCookie.role === "operator"
            ? "/OperatorDashboard"
            : "/TravellerProfile";
      return NextResponse.redirect(new URL(destination, request.url));
    }
  } else if (!hasSupabaseAuth && isProtectedTravelerRoute) {
    const redirectUrl = new URL("/LoginPage", request.url);
    const redirectTarget = `${pathname}${searchParams.toString() ? request.nextUrl.search : ""}`;
    redirectUrl.searchParams.set("redirect", redirectTarget);
    return NextResponse.redirect(redirectUrl);
  } else if (!hasSupabaseAuth && isProtectedAdminRoute) {
    return NextResponse.redirect(new URL("/AdminLogin", request.url));
  } else if (!hasSupabaseAuth && isProtectedOperatorRoute) {
    return NextResponse.redirect(new URL("/OperatorLogin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
