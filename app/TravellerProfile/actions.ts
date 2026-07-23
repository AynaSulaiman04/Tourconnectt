"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSupabaseServiceRoleClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { setPortalAuthCookie } from "@/lib/supabase/portal-auth";
import { normalizeProfileImageSource } from "@/lib/supabase/profile-image";
import { parseTravelerCareFormData, upsertTravelerCareProfile } from "@/lib/supabase/traveler-care";
import {
  initialProfileFormState,
  initialTravelSummaryFormState,
  type ProfileFormState,
  type TravelSummaryFormState,
} from "./types";
const MAX_PROFILE_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const profileSchema = z.object({
  fullName: z.string({ error: "Enter a full name." }).trim().min(2, { error: "Enter a full name." }),
  preferredInquiryArea: z.enum(["desert", "coastal", "arctic"], {
    error: "Choose a preferred inquiry area.",
  }),
});

async function fileToDataUrl(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type || "image/jpeg";

  return `data:${mimeType};base64,${base64}`;
}

const travelSummarySchema = z.object({
  countryName: z
    .string({ error: "Add a country name." })
    .trim()
    .min(2, { error: "Add a country name." })
    .max(80, { error: "Country names must be 80 characters or fewer." }),
});

function normalizeCountryName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export async function updateProfileAction(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const validatedFields = profileSchema.safeParse({
    fullName: formData.get("full_name"),
    preferredInquiryArea: formData.get("preferred_inquiry_area"),
  });
  const validatedCareFields = parseTravelerCareFormData(formData);

  if (!validatedFields.success || !validatedCareFields.success) {
    return {
      ...initialProfileFormState,
      message: "Please review the highlighted fields.",
      profileImageUrl: null,
      fieldErrors: {
        ...(!validatedFields.success ? validatedFields.error.flatten().fieldErrors : {}),
        ...(!validatedCareFields.success ? validatedCareFields.error.flatten().fieldErrors : {}),
      },
    };
  }

  const profileImageInput = formData.get("profile_image");
  const profileImageFile = profileImageInput instanceof File && profileImageInput.size > 0 ? profileImageInput : null;

  if (profileImageFile && !ALLOWED_PROFILE_IMAGE_TYPES.has(profileImageFile.type)) {
    return {
      ...initialProfileFormState,
      message: "Please upload a JPG, PNG, or WEBP image.",
      profileImageUrl: null,
      fieldErrors: {
        profileImage: ["Please upload a JPG, PNG, or WEBP image."],
      },
    };
  }

  if (profileImageFile && profileImageFile.size > MAX_PROFILE_IMAGE_SIZE) {
    return {
      ...initialProfileFormState,
      message: "Profile images must be 2MB or smaller.",
      profileImageUrl: null,
      fieldErrors: {
        profileImage: ["Profile images must be 2MB or smaller."],
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return {
      ...initialProfileFormState,
      message: "Please sign in again to update your profile.",
      profileImageUrl: null,
      fieldErrors: {},
    };
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: currentProfile } = await admin
    .from("profiles")
    .select("avatar_base64,profile_image_url")
    .eq("id", authData.user.id)
    .maybeSingle();

  const existingProfileImage =
    normalizeProfileImageSource((currentProfile as { avatar_base64?: string | null } | null)?.avatar_base64) ??
    normalizeProfileImageSource((currentProfile as { profile_image_url?: string | null } | null)?.profile_image_url);

  let profileImageUrl: string | null = existingProfileImage;

  if (profileImageFile) {
    profileImageUrl = await fileToDataUrl(profileImageFile);
  }

  const profileUpdatePayload = {
    full_name: validatedFields.data.fullName,
    preferred_inquiry_area: validatedFields.data.preferredInquiryArea,
    ...(profileImageUrl ? { avatar_base64: profileImageUrl, profile_image_url: null } : {}),
  };

  let profileUpdateError: { message: string } | null = null;

  {
    const { error } = await admin
      .from("profiles")
      .update(profileUpdatePayload)
      .eq("id", authData.user.id);

    profileUpdateError = error ?? null;
  }

  if (profileUpdateError && profileImageUrl) {
    const { error: fallbackUpdateError } = await admin
      .from("profiles")
      .update({
        full_name: validatedFields.data.fullName,
        preferred_inquiry_area: validatedFields.data.preferredInquiryArea,
      })
      .eq("id", authData.user.id);

    if (!fallbackUpdateError) {
      profileUpdateError = null;
    }
  }

  if (profileUpdateError) {
    console.error("Unable to update traveler profile", {
      userId: authData.user.id,
      error: profileUpdateError.message,
    });

    return {
      ...initialProfileFormState,
      message: "We could not save your profile. Please try again.",
      profileImageUrl: null,
      fieldErrors: {},
    };
  }

  try {
    await upsertTravelerCareProfile(authData.user.id, validatedCareFields.data);
  } catch (error) {
    return {
      ...initialProfileFormState,
      message: error instanceof Error ? error.message : "We could not save your guest care information.",
      profileImageUrl,
      fieldErrors: {},
    };
  }

  await setPortalAuthCookie(cookieStore, {
    id: authData.user.id,
    email: authData.user.email ?? "",
    full_name: validatedFields.data.fullName,
    profile_image_url: profileImageUrl,
    role:
      authData.user.user_metadata?.role === "operator" || authData.user.user_metadata?.role === "admin"
        ? authData.user.user_metadata.role
        : "traveler",
  });

  revalidatePath("/TravellerProfile");
  revalidatePath("/AdminUsers");
  revalidatePath("/OperatorUserManage");

  return {
    success: true,
    message: "Profile saved.",
    profileImageUrl,
    fieldErrors: {},
  };
}

export async function addTravelerCountryAction(
  _state: TravelSummaryFormState,
  formData: FormData,
): Promise<TravelSummaryFormState> {
  const validatedFields = travelSummarySchema.safeParse({
    countryName: formData.get("country_name"),
  });

  if (!validatedFields.success) {
    return {
      ...initialTravelSummaryFormState,
      message: "Please add a country name.",
      fieldErrors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return {
      ...initialTravelSummaryFormState,
      message: "Please sign in again to update your travel summary.",
      fieldErrors: {},
    };
  }

  const admin = createSupabaseServiceRoleClient();
  const countryName = normalizeCountryName(validatedFields.data.countryName);

  const { error } = await admin.from("traveler_countries").insert({
    user_id: authData.user.id,
    country_name: countryName,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ...initialTravelSummaryFormState,
        message: "That country is already in your travel summary.",
        fieldErrors: {},
      };
    }

    if (error.code === "42P01" || error.message.includes("Could not find the table")) {
      return {
        ...initialTravelSummaryFormState,
        message: "Travel summary is not available yet.",
        fieldErrors: {},
      };
    }

    console.error("Unable to add traveler country", {
      userId: authData.user.id,
      countryName,
      error: error.message,
    });

    return {
      ...initialTravelSummaryFormState,
      message: "We could not add that country. Please try again.",
      fieldErrors: {},
    };
  }

  revalidatePath("/TravellerProfile");

  return {
    success: true,
    message: "Country added.",
    fieldErrors: {},
  };
}

export async function deleteTravelerCountryAction(formData: FormData) {
  const countryId = formData.get("country_id");

  if (typeof countryId !== "string" || !countryId.trim()) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return;
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("traveler_countries")
    .delete()
    .eq("id", countryId)
    .eq("user_id", authData.user.id);

  if (error && error.code !== "42P01" && !error.message.includes("Could not find the table")) {
    console.warn("Unable to delete traveler country:", error.message);
  }

  revalidatePath("/TravellerProfile");
}
