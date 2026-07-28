import { NextRequest, NextResponse } from "next/server";

const PROTECTED_ROUTES = {
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
  traveler: ["/TravellerProfile", "/AccountSetting", "/Messages"],
} as const;

function pathMatches(pathname: string, candidate: string) {
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((entry) => /^sb-.*-auth-token(\.\d+)?$/.test(entry.name));
}

// Next.js 16 recommends proxy.ts, but Proxy is Node-only. OpenNext currently
// requires edge middleware, which the Next.js 16 upgrade guide explicitly
// supports by retaining this file convention.
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (hasSupabaseSessionCookie(request)) {
    return NextResponse.next();
  }

  if (PROTECTED_ROUTES.traveler.some((route) => pathMatches(pathname, route))) {
    const redirectUrl = new URL("/LoginPage", request.url);
    const redirectTarget = `${pathname}${searchParams.toString() ? request.nextUrl.search : ""}`;
    redirectUrl.searchParams.set("redirect", redirectTarget);
    return NextResponse.redirect(redirectUrl);
  }

  if (PROTECTED_ROUTES.admin.some((route) => pathMatches(pathname, route))) {
    return NextResponse.redirect(new URL("/AdminLogin", request.url));
  }

  if (PROTECTED_ROUTES.operator.some((route) => pathMatches(pathname, route))) {
    return NextResponse.redirect(new URL("/OperatorLogin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
