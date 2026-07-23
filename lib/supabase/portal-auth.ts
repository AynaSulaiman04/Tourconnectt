import type { TravelerProfile } from "./profile-types";

export const PORTAL_AUTH_COOKIE_NAME = "tt-connect-portal-auth";

export type PortalAuthCookiePayload = {
  id: string;
  email: string;
  full_name: string;
  role: TravelerProfile["role"];
  profile_image_url?: string | null;
};

type CookieStore = Awaited<ReturnType<typeof import("next/headers").cookies>>;

function encodeUtf8Base64Url(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeUtf8Base64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function serializePortalAuthCookie(payload: PortalAuthCookiePayload) {
  return encodeUtf8Base64Url(JSON.stringify(payload));
}

function parsePortalAuthCookie(raw: string) {
  try {
    const parsed = JSON.parse(decodeUtf8Base64Url(raw)) as Partial<PortalAuthCookiePayload>;

    if (
      typeof parsed.id === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.full_name === "string" &&
      (parsed.role === "traveler" || parsed.role === "operator" || parsed.role === "admin")
    ) {
      return {
        id: parsed.id,
        email: parsed.email,
        full_name: parsed.full_name,
        role: parsed.role,
        profile_image_url:
          typeof parsed.profile_image_url === "string" && parsed.profile_image_url.trim().length > 0
            ? parsed.profile_image_url
            : null,
      };
    }
  } catch {
    try {
      const decoded = decodeURIComponent(raw);
      const parsed = JSON.parse(decodeUtf8Base64Url(decoded)) as Partial<PortalAuthCookiePayload>;

      if (
        typeof parsed.id === "string" &&
        typeof parsed.email === "string" &&
        typeof parsed.full_name === "string" &&
        (parsed.role === "traveler" || parsed.role === "operator" || parsed.role === "admin")
      ) {
        return {
          id: parsed.id,
          email: parsed.email,
          full_name: parsed.full_name,
          role: parsed.role,
          profile_image_url:
            typeof parsed.profile_image_url === "string" && parsed.profile_image_url.trim().length > 0
              ? parsed.profile_image_url
              : null,
        };
      }
    } catch {
      try {
        const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<PortalAuthCookiePayload>;

        if (
          typeof parsed.id === "string" &&
          typeof parsed.email === "string" &&
          typeof parsed.full_name === "string" &&
          (parsed.role === "traveler" || parsed.role === "operator" || parsed.role === "admin")
        ) {
          return {
            id: parsed.id,
            email: parsed.email,
            full_name: parsed.full_name,
            role: parsed.role,
            profile_image_url:
              typeof parsed.profile_image_url === "string" && parsed.profile_image_url.trim().length > 0
                ? parsed.profile_image_url
                : null,
          };
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function setPortalAuthCookie(
  cookieStore: CookieStore,
  payload: PortalAuthCookiePayload,
) {
  cookieStore.set(PORTAL_AUTH_COOKIE_NAME, serializePortalAuthCookie(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

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

export async function readPortalAuthCookie(
  cookieStore: CookieStore,
) {
  const raw = cookieStore.get(PORTAL_AUTH_COOKIE_NAME)?.value;

  if (!raw) {
    return null;
  }

  return parsePortalAuthCookie(raw) ?? null;
}

export function setPortalAuthCookieClient(payload: PortalAuthCookiePayload) {
  document.cookie = `${PORTAL_AUTH_COOKIE_NAME}=${serializePortalAuthCookie(payload)}; path=/; sameSite=lax`;
}

export function clearPortalAuthCookieClient() {
  document.cookie = `${PORTAL_AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; sameSite=lax`;
}

export function readPortalAuthCookieValue(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  return parsePortalAuthCookie(raw);
}

export function readPortalAuthCookieFromDocument() {
  if (typeof document === "undefined") {
    return null;
  }

  const rawCookie = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${PORTAL_AUTH_COOKIE_NAME}=`))
    ?.slice(PORTAL_AUTH_COOKIE_NAME.length + 1);

  return readPortalAuthCookieValue(rawCookie);
}
