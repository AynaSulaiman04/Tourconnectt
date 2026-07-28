import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "./server";
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
  "id,email,full_name,preferred_inquiry_area,role,is_active,status_reason,last_seen_at,profile_image_url,avatar_base64,created_at,updated_at";
const PROFILE_SELECT_BASE =
  "id,email,full_name,preferred_inquiry_area,role,is_active,status_reason,last_seen_at,created_at,updated_at";

type ProfileQueryError = {
  code?: string | null;
  message?: string | null;
};

function isMissingColumnError(error: ProfileQueryError | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.message?.includes("profile_image_url") ||
        error.message?.includes("avatar_base64")),
  );
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

  if (!isMissingColumnError(withImage.error)) {
    return withImage;
  }

  return admin
    .from("profiles")
    .select(PROFILE_SELECT_BASE)
    .eq("id", userId)
    .maybeSingle();
}

export async function getCurrentUserProfile() {
  const userContext = await getOptionalCurrentUserProfile();

  if (!userContext) {
    redirect("/LoginPage");
  }

  if (userContext.profile.role !== "traveler") {
    redirect(getDashboardRoute(userContext.profile.role));
  }

  return userContext;
}

export async function getOptionalCurrentUserProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const authUser = userData.user;

  if (userError || !authUser) {
    return null;
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: profile, error } = await fetchProfileRecord(admin, authUser.id);

  if (error) {
    console.error("Unable to load authenticated profile", {
      userId: authUser.id,
      code: error.code,
    });
    throw new Error("The account service is temporarily unavailable.");
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
        role: "traveler",
        is_active: true,
        status_reason: null,
      },
      {
        onConflict: "id",
      },
    );

    if (upsertError) {
      console.error("Unable to create authenticated profile", {
        userId: authUser.id,
        code: upsertError.code,
      });
      throw new Error("The account service is temporarily unavailable.");
    }

    const { data: createdProfile, error: createdProfileError } = await fetchProfileRecord(
      admin,
      authUser.id,
    );

    if (createdProfileError || !createdProfile) {
      console.error("Unable to reload authenticated profile", {
        userId: authUser.id,
        code: createdProfileError?.code,
      });
      throw new Error("The account service is temporarily unavailable.");
    }

    return {
      authUser,
      profile: {
        ...createdProfile,
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
    profile_image_url:
      normalizeProfileImageSource((profile as { avatar_base64?: string | null } | null)?.avatar_base64) ??
      normalizeProfileImageSource((profile as { profile_image_url?: string | null } | null)?.profile_image_url) ??
      resolveProfileImageUrl(authUser.user_metadata),
  } as TravelerProfile;

  if (!typedProfile.is_active) {
    return null;
  }

  return {
    authUser,
    profile: typedProfile,
  };
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
