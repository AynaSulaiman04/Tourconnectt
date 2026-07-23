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
