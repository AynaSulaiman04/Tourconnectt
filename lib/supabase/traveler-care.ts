import "server-only";

import { z } from "zod";
import { createSupabaseServiceRoleClient } from "./server";

export type TravelerCareProfile = {
  user_id: string;
  phone_number: string | null;
  allergies: string | null;
  dietary_restrictions: string | null;
  mobility_requirements: string | null;
  medical_notes: string | null;
  can_walk_15_minutes: boolean | null;
  default_pickup_location: string | null;
  preferred_pickup_time: string | null;
  created_at: string;
  updated_at: string;
};

const optionalText = (maximum: number, message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(maximum, { error: message }),
  );

export const travelerCareProfileSchema = z.object({
  phoneNumber: optionalText(32, "Phone numbers must be 32 characters or fewer."),
  allergies: optionalText(1000, "Allergy notes must be 1,000 characters or fewer."),
  dietaryRestrictions: optionalText(1000, "Dietary notes must be 1,000 characters or fewer."),
  mobilityRequirements: optionalText(1000, "Mobility notes must be 1,000 characters or fewer."),
  medicalNotes: optionalText(2000, "Medical notes must be 2,000 characters or fewer."),
  canWalk15Minutes: z.enum(["yes", "no", "unsure", ""]),
  defaultPickupLocation: optionalText(300, "Pickup locations must be 300 characters or fewer."),
  preferredPickupTime: optionalText(120, "Pickup times must be 120 characters or fewer."),
});

export type TravelerCareProfileInput = z.infer<typeof travelerCareProfileSchema>;

function isMissingRelation(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("Could not find the table"));
}

function isMissingProfileImageColumn(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.code === "PGRST204" ||
        error.message?.includes("avatar_base64") ||
        error.message?.includes("profile_image_url")),
  );
}

function isAmbiguousWriteError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (!error.code ||
        (error.code.startsWith("PGRST") && error.code !== "PGRST204") ||
        error.message?.toLowerCase().includes("failed to fetch") ||
        error.message?.toLowerCase().includes("network")),
  );
}

export class TravelerProfileBundleUpdateError extends Error {
  partialFailure: boolean;

  constructor(message: string, partialFailure = false) {
    super(message);
    this.name = "TravelerProfileBundleUpdateError";
    this.partialFailure = partialFailure;
  }
}

export function parseTravelerCareFormData(formData: FormData) {
  return travelerCareProfileSchema.safeParse({
    phoneNumber: formData.get("phone_number"),
    allergies: formData.get("allergies"),
    dietaryRestrictions: formData.get("dietary_restrictions"),
    mobilityRequirements: formData.get("mobility_requirements"),
    medicalNotes: formData.get("medical_notes"),
    canWalk15Minutes: formData.get("can_walk_15_minutes"),
    defaultPickupLocation: formData.get("default_pickup_location"),
    preferredPickupTime: formData.get("preferred_pickup_time"),
  });
}

export async function getTravelerCareProfile(userId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("traveler_care_profiles")
    .select("user_id,phone_number,allergies,dietary_restrictions,mobility_requirements,medical_notes,can_walk_15_minutes,default_pickup_location,preferred_pickup_time,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) {
      return null;
    }
    throw new Error(error.message);
  }

  return (data ?? null) as TravelerCareProfile | null;
}

export async function getTravelerCareProfiles(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return [] as TravelerCareProfile[];
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("traveler_care_profiles")
    .select("user_id,phone_number,allergies,dietary_restrictions,mobility_requirements,medical_notes,can_walk_15_minutes,default_pickup_location,preferred_pickup_time,created_at,updated_at")
    .in("user_id", uniqueIds);

  if (error) {
    if (isMissingRelation(error)) {
      return [] as TravelerCareProfile[];
    }
    throw new Error(error.message);
  }

  return (data ?? []) as TravelerCareProfile[];
}

export async function upsertTravelerCareProfile(userId: string, input: TravelerCareProfileInput) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("traveler_care_profiles").upsert(
    {
      user_id: userId,
      phone_number: input.phoneNumber || null,
      allergies: input.allergies || null,
      dietary_restrictions: input.dietaryRestrictions || null,
      mobility_requirements: input.mobilityRequirements || null,
      medical_notes: input.medicalNotes || null,
      can_walk_15_minutes:
        input.canWalk15Minutes === "yes" ? true : input.canWalk15Minutes === "no" ? false : null,
      default_pickup_location: input.defaultPickupLocation || null,
      preferred_pickup_time: input.preferredPickupTime || null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(
      isMissingRelation(error)
        ? "Traveler care profiles are not available until the latest database migration is applied."
        : error.message,
    );
  }
}

export async function updateTravelerProfileBundle(params: {
  userId: string;
  fullName: string;
  preferredInquiryArea: "desert" | "coastal" | "arctic";
  profileImageDataUrl: string | null;
  careProfile: TravelerCareProfileInput;
}) {
  const admin = createSupabaseServiceRoleClient();
  const includesProfileImage = params.profileImageDataUrl !== null;
  const profileColumns = includesProfileImage
    ? "id,full_name,preferred_inquiry_area,avatar_base64,profile_image_url,updated_at"
    : "id,full_name,preferred_inquiry_area,updated_at";
  const { data: previousProfileData, error: previousProfileError } = await admin
    .from("profiles")
    .select(profileColumns)
    .eq("id", params.userId)
    .eq("role", "traveler")
    .eq("is_active", true)
    .maybeSingle();

  if (previousProfileError) {
    throw new TravelerProfileBundleUpdateError(
      includesProfileImage && isMissingProfileImageColumn(previousProfileError)
        ? "Your profile was not changed because profile image storage is unavailable."
        : "We could not prepare your profile update. No changes were applied.",
    );
  }

  if (!previousProfileData) {
    throw new TravelerProfileBundleUpdateError(
      "We could not verify an active traveler profile. No changes were applied.",
    );
  }

  const previousProfile = previousProfileData as unknown as {
    id: string;
    full_name: string;
    preferred_inquiry_area: "desert" | "coastal" | "arctic" | null;
    avatar_base64?: string | null;
    profile_image_url?: string | null;
    updated_at: string;
  };
  const { data: previousCareData, error: previousCareError } = await admin
    .from("traveler_care_profiles")
    .select(
      "user_id,phone_number,allergies,dietary_restrictions,mobility_requirements,medical_notes,can_walk_15_minutes,default_pickup_location,preferred_pickup_time,created_at,updated_at",
    )
    .eq("user_id", params.userId)
    .maybeSingle();

  if (previousCareError) {
    throw new TravelerProfileBundleUpdateError(
      isMissingRelation(previousCareError)
        ? "Traveler care profiles are not available until the latest database migration is applied."
        : "We could not prepare your guest care update. No changes were applied.",
    );
  }

  const previousCareProfile = (previousCareData ?? null) as TravelerCareProfile | null;
  const carePayload = {
    user_id: params.userId,
    phone_number: params.careProfile.phoneNumber || null,
    allergies: params.careProfile.allergies || null,
    dietary_restrictions: params.careProfile.dietaryRestrictions || null,
    mobility_requirements: params.careProfile.mobilityRequirements || null,
    medical_notes: params.careProfile.medicalNotes || null,
    can_walk_15_minutes:
      params.careProfile.canWalk15Minutes === "yes"
        ? true
        : params.careProfile.canWalk15Minutes === "no"
          ? false
          : null,
    default_pickup_location: params.careProfile.defaultPickupLocation || null,
    preferred_pickup_time: params.careProfile.preferredPickupTime || null,
  };
  const profilePayload = {
    full_name: params.fullName,
    preferred_inquiry_area: params.preferredInquiryArea,
    ...(includesProfileImage
      ? {
          avatar_base64: params.profileImageDataUrl,
          profile_image_url: null,
        }
      : {}),
  };

  async function restoreProfile(expectedUpdatedAt: string) {
    const restorePayload = {
      full_name: previousProfile.full_name,
      preferred_inquiry_area: previousProfile.preferred_inquiry_area,
      ...(includesProfileImage
        ? {
            avatar_base64: previousProfile.avatar_base64 ?? null,
            profile_image_url: previousProfile.profile_image_url ?? null,
          }
        : {}),
    };
    try {
      const { data, error } = await admin
        .from("profiles")
        .update(restorePayload)
        .eq("id", params.userId)
        .eq("role", "traveler")
        .eq("is_active", true)
        .eq("updated_at", expectedUpdatedAt)
        .select("id,updated_at")
        .maybeSingle();

      return error?.message ?? (!data ? "Traveler profile rollback did not match the saved version." : null);
    } catch (error) {
      return error instanceof Error ? error.message : "Traveler profile rollback could not be confirmed.";
    }
  }

  const { data: updatedProfile, error: profileUpdateError } = await (async () => {
    try {
      return await admin
        .from("profiles")
        .update(profilePayload)
        .eq("id", params.userId)
        .eq("role", "traveler")
        .eq("is_active", true)
        .eq("updated_at", previousProfile.updated_at)
        .select("id,updated_at")
        .maybeSingle();
    } catch {
      throw new TravelerProfileBundleUpdateError(
        "We could not confirm whether your profile update completed. Some changes may have been applied. Reload the page before trying again.",
        true,
      );
    }
  })();

  if (profileUpdateError) {
    if (includesProfileImage && isMissingProfileImageColumn(profileUpdateError)) {
      throw new TravelerProfileBundleUpdateError(
        "Your profile was not changed because the profile image could not be saved.",
      );
    }

    if (isAmbiguousWriteError(profileUpdateError)) {
      throw new TravelerProfileBundleUpdateError(
        "We could not confirm whether your profile update completed. Some changes may have been applied. Reload the page before trying again.",
        true,
      );
    }

    throw new TravelerProfileBundleUpdateError(
      "We could not save your profile. No changes were applied.",
    );
  }

  if (!updatedProfile) {
    throw new TravelerProfileBundleUpdateError(
      "Your profile changed in another session. This save was not applied; reload the page and try again.",
    );
  }

  const savedProfile = updatedProfile as { id: string; updated_at: string };
  const careMutation = previousCareProfile
    ? admin
        .from("traveler_care_profiles")
        .update({
          phone_number: carePayload.phone_number,
          allergies: carePayload.allergies,
          dietary_restrictions: carePayload.dietary_restrictions,
          mobility_requirements: carePayload.mobility_requirements,
          medical_notes: carePayload.medical_notes,
          can_walk_15_minutes: carePayload.can_walk_15_minutes,
          default_pickup_location: carePayload.default_pickup_location,
          preferred_pickup_time: carePayload.preferred_pickup_time,
        })
        .eq("user_id", params.userId)
        .eq("updated_at", previousCareProfile.updated_at)
        .select("user_id,updated_at")
        .maybeSingle()
    : admin
        .from("traveler_care_profiles")
        .insert(carePayload)
        .select("user_id,updated_at")
        .maybeSingle();
  const { data: updatedCareProfile, error: careUpdateError } = await (async () => {
    try {
      return await careMutation;
    } catch {
      throw new TravelerProfileBundleUpdateError(
        "We could not confirm whether all profile details were saved. Some changes may have been applied. Reload the page before trying again.",
        true,
      );
    }
  })();

  if (careUpdateError) {
    if (isAmbiguousWriteError(careUpdateError)) {
      throw new TravelerProfileBundleUpdateError(
        "We could not confirm whether all profile details were saved. Some changes may have been applied. Reload the page before trying again.",
        true,
      );
    }

    const profileRollbackError = await restoreProfile(savedProfile.updated_at);
    if (profileRollbackError) {
      throw new TravelerProfileBundleUpdateError(
        "We could not finish or fully roll back your profile update. Some changes may have been applied. Reload the page before trying again.",
        true,
      );
    }

    throw new TravelerProfileBundleUpdateError(
      "We could not save your profile. No changes were applied.",
    );
  }

  if (!updatedCareProfile) {
    const profileRollbackError = await restoreProfile(savedProfile.updated_at);
    if (profileRollbackError) {
      throw new TravelerProfileBundleUpdateError(
        "Your profile changed while this save was being recovered. Some changes may have been applied. Reload the page before trying again.",
        true,
      );
    }

    throw new TravelerProfileBundleUpdateError(
      "Your guest care profile changed in another session. This save was not applied; reload the page and try again.",
    );
  }
}
