import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "./server";
import { readPortalAuthCookie } from "./portal-auth";
import { normalizeProfileImageSource } from "./profile-image";
import type { TravelerProfile } from "./profile-types";

function getDashboardRoute(role: TravelerProfile["role"]) {
  switch (role) {
    case "admin":
      return "/AdminDashboard";
    case "operator":
      return "/OperatorDashboard";
    case "traveler":
    default:
      return "/TravellerProfile";
  }
}

function resolveProfileImageUrl(userMetadata: Record<string, unknown> | undefined) {
  return normalizeProfileImageSource(
    typeof userMetadata?.profile_image_url === "string" ? userMetadata.profile_image_url : null,
  );
}

const PROFILE_SELECT_WITH_IMAGE =
  "id,email,full_name,preferred_inquiry_area,role,profile_image_url,avatar_base64,created_at,updated_at";
const PROFILE_SELECT_BASE = "id,email,full_name,preferred_inquiry_area,role,created_at,updated_at";

function isFetchFailedError(error: unknown) {
  return error instanceof Error && (error.message === "TypeError: fetch failed" || error.message.includes("fetch failed"));
}

async function fetchProfileRecord(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  userId: string,
) {
  const withImage = await admin
    .from("profiles")
    .select(PROFILE_SELECT_WITH_IMAGE)
    .eq("id", userId)
    .maybeSingle();

  if (!withImage.error) {
    return withImage;
  }

  return admin
    .from("profiles")
    .select(PROFILE_SELECT_BASE)
    .eq("id", userId)
    .maybeSingle();
}

export async function getCurrentUserProfile() {
  const supabase = await createSupabaseServerClient();
  const authUser = await getAuthenticatedUser(supabase);

  if (!authUser) {
    redirect("/LoginPage");
  }

  const userContext = await getOptionalCurrentUserProfile();

  if (userContext) {
    const { authUser: currentAuthUser, profile } = userContext;

    if (profile.role !== "traveler") {
      redirect(getDashboardRoute(profile.role));
    }

    return {
      authUser: currentAuthUser,
      profile,
    };
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: fallbackProfile, error } = await fetchProfileRecord(admin, authUser.id);

  if (error || !fallbackProfile) {
    const upsertPayload = {
      id: authUser.id,
      email: authUser.email ?? "",
      full_name:
        typeof authUser.user_metadata?.full_name === "string" &&
        authUser.user_metadata.full_name.trim().length > 0
          ? authUser.user_metadata.full_name.trim()
          : (authUser.email ?? "Traveler").split("@")[0],
      preferred_inquiry_area: null,
      role:
        authUser.user_metadata?.role === "operator" || authUser.user_metadata?.role === "admin"
          ? authUser.user_metadata.role
          : "traveler",
    };

    await admin.from("profiles").upsert(upsertPayload, { onConflict: "id" });

    const { data: createdProfile } = await fetchProfileRecord(admin, authUser.id);

    if (!createdProfile) {
      redirect("/LoginPage");
    }

    return {
      authUser,
      profile: {
        ...createdProfile,
        is_active: true,
        status_reason: null,
        last_seen_at: null,
        profile_image_url:
          normalizeProfileImageSource(
            (createdProfile as { avatar_base64?: string | null } | null)?.avatar_base64,
          ) ??
          normalizeProfileImageSource(
            (createdProfile as { profile_image_url?: string | null } | null)?.profile_image_url,
          ) ??
          resolveProfileImageUrl(authUser.user_metadata),
      } as TravelerProfile,
    };
  }

  if (fallbackProfile.role !== "traveler") {
    redirect(getDashboardRoute(fallbackProfile.role));
  }

  return {
    authUser,
    profile: {
      ...fallbackProfile,
      is_active: true,
      status_reason: null,
      last_seen_at: null,
      profile_image_url:
        normalizeProfileImageSource(
          (fallbackProfile as { avatar_base64?: string | null } | null)?.avatar_base64,
        ) ??
        normalizeProfileImageSource(
          (fallbackProfile as { profile_image_url?: string | null } | null)?.profile_image_url,
        ) ??
        resolveProfileImageUrl(authUser.user_metadata),
    } as TravelerProfile,
  };
}

export async function getOptionalCurrentUserProfile() {
  try {
    const supabase = await createSupabaseServerClient();
    const authUser = await getAuthenticatedUser(supabase);

    if (!authUser) {
      return null;
    }

    const admin = createSupabaseServiceRoleClient();
    const { data: profile, error } = await fetchProfileRecord(admin, authUser.id);

    if (error) {
      if (isFetchFailedError(error)) {
        return null;
      }

      return null;
    }

    if (!profile) {
      const { error: upsertError } = await admin.from("profiles").upsert(
        {
          id: authUser.id,
          email: authUser.email ?? "",
          full_name:
            typeof authUser.user_metadata?.full_name === "string" &&
            authUser.user_metadata.full_name.trim().length > 0
              ? authUser.user_metadata.full_name.trim()
              : (authUser.email ?? "Traveler").split("@")[0],
          preferred_inquiry_area: null,
          role:
            authUser.user_metadata?.role === "operator" ||
            authUser.user_metadata?.role === "admin"
              ? authUser.user_metadata.role
              : "traveler",
        },
        {
          onConflict: "id",
        },
      );

      if (upsertError) {
        return null;
      }

      const { data: createdProfile } = await fetchProfileRecord(admin, authUser.id);

      if (!createdProfile) {
        return null;
      }

      return {
        authUser,
        profile: {
          ...createdProfile,
          is_active: true,
          status_reason: null,
          last_seen_at: null,
          profile_image_url:
            normalizeProfileImageSource(
              (createdProfile as { avatar_base64?: string | null } | null)?.avatar_base64,
            ) ??
            normalizeProfileImageSource(
              (createdProfile as { profile_image_url?: string | null } | null)?.profile_image_url,
            ) ??
            resolveProfileImageUrl(authUser.user_metadata),
        } as TravelerProfile,
      };
    }

    const typedProfile = {
      ...profile,
      is_active: true,
      status_reason: null,
      last_seen_at: null,
      profile_image_url:
        normalizeProfileImageSource((profile as { avatar_base64?: string | null } | null)?.avatar_base64) ??
        normalizeProfileImageSource((profile as { profile_image_url?: string | null } | null)?.profile_image_url) ??
        resolveProfileImageUrl(authUser.user_metadata),
    } as TravelerProfile;

    return {
      authUser,
      profile: typedProfile,
    };
  } catch (error) {
    if (!isFetchFailedError(error)) {
      return null;
    }

    return null;
  }
}

export function getRoleDashboardRoute(role: string | null | undefined) {
  switch (role) {
    case "admin":
      return "/AdminDashboard";
    case "operator":
      return "/OperatorDashboard";
    case "traveler":
    default:
      return "/TravellerProfile";
  }
}

type SessionUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

async function getAuthenticatedUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<SessionUser | null> {
  const { data: userData } = await supabase.auth.getUser();

  if (userData.user) {
    const cookieUser = await getAuthenticatedUserFromCookies();

    return {
      id: userData.user.id,
      email: userData.user.email ?? cookieUser?.email ?? null,
      user_metadata: {
        ...(cookieUser?.user_metadata ?? {}),
        ...(userData.user.user_metadata ?? {}),
      },
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session?.user) {
    const cookieUser = await getAuthenticatedUserFromCookies();

    return {
      id: sessionData.session.user.id,
      email: sessionData.session.user.email ?? cookieUser?.email ?? null,
      user_metadata: {
        ...(cookieUser?.user_metadata ?? {}),
        ...(sessionData.session.user.user_metadata ?? {}),
      },
    };
  }

  const cookieUser = await getAuthenticatedUserFromCookies();

  if (cookieUser) {
    return cookieUser;
  }

  return null;
}

async function getAuthenticatedUserFromCookies(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const portalCookie = await readPortalAuthCookie(cookieStore);

  if (portalCookie) {
    return {
      id: portalCookie.id,
      email: portalCookie.email,
      user_metadata: {
        full_name: portalCookie.full_name,
        role: portalCookie.role,
        profile_image_url: portalCookie.profile_image_url ?? undefined,
      },
    };
  }

  const sessionCookies = cookieStore
    .getAll()
    .filter((entry) => /^sb-.*-auth-token(\.\d+)?$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (!sessionCookies.length) {
    return null;
  }

  const encodedSession = sessionCookies.map((entry) => entry.value).join("");
  const payload = encodedSession.startsWith("base64-") ? encodedSession.slice(7) : encodedSession;

  try {
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const parsedSession = JSON.parse(decoded) as {
      user?: {
        id: string;
        email?: string | null;
        user_metadata?: Record<string, unknown>;
      } | null;
    };

    if (parsedSession.user) {
      return {
        id: parsedSession.user.id,
        email: parsedSession.user.email ?? null,
        user_metadata: parsedSession.user.user_metadata ?? {},
      };
    }
  } catch {
    return null;
  }

  return null;
}
