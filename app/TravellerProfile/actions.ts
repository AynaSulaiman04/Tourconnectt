"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  parseTravelerCareFormData,
  TravelerProfileBundleUpdateError,
  updateTravelerProfileBundle,
} from "@/lib/supabase/traveler-care";
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

async function getActiveTravelerId() {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return null;
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userData.user.id)
    .eq("role", "traveler")
    .eq("is_active", true)
    .maybeSingle();

  if (profileError) {
    console.error("Unable to verify traveler profile", {
      userId: userData.user.id,
      error: profileError.message,
    });
    return null;
  }

  return profile?.id ?? null;
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

  const travelerId = await getActiveTravelerId();

  if (!travelerId) {
    return {
      ...initialProfileFormState,
      message: "Please sign in again to update your profile.",
      profileImageUrl: null,
      fieldErrors: {},
    };
  }

  const profileImageUrl = profileImageFile ? await fileToDataUrl(profileImageFile) : null;

  try {
    await updateTravelerProfileBundle({
      userId: travelerId,
      fullName: validatedFields.data.fullName,
      preferredInquiryArea: validatedFields.data.preferredInquiryArea,
      profileImageDataUrl: profileImageUrl,
      careProfile: validatedCareFields.data,
    });
  } catch (error) {
    console.error("Unable to update traveler profile bundle", {
      userId: travelerId,
      error: error instanceof Error ? error.message : error,
    });

    return {
      ...initialProfileFormState,
      message:
        error instanceof TravelerProfileBundleUpdateError
          ? error.message
          : "We could not save your profile. No changes were applied. Please try again.",
      profileImageUrl: null,
      fieldErrors: {},
    };
  }

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

  const travelerId = await getActiveTravelerId();

  if (!travelerId) {
    return {
      ...initialTravelSummaryFormState,
      message: "Please sign in again to update your travel summary.",
      fieldErrors: {},
    };
  }

  const admin = createSupabaseServiceRoleClient();
  const countryName = normalizeCountryName(validatedFields.data.countryName);

  const { error } = await admin.from("traveler_countries").insert({
    user_id: travelerId,
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
      userId: travelerId,
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

  const travelerId = await getActiveTravelerId();

  if (!travelerId) {
    return;
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("traveler_countries")
    .delete()
    .eq("id", countryId)
    .eq("user_id", travelerId);

  if (error && error.code !== "42P01" && !error.message.includes("Could not find the table")) {
    console.warn("Unable to delete traveler country:", error.message);
  }

  revalidatePath("/TravellerProfile");
}
