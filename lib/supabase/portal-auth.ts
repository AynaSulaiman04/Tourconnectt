export const PORTAL_AUTH_COOKIE_NAME = "tt-connect-portal-auth";

type CookieStore = Awaited<ReturnType<typeof import("next/headers").cookies>>;

export async function clearPortalAuthCookie(
  cookieStore: CookieStore,
) {
  cookieStore.set(PORTAL_AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    secure: process.env.NODE_ENV === "production",
  });
}
