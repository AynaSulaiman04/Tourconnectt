import "server-only";

import { createSupabaseServiceRoleClient } from "./server";
import type { TravelerCountry } from "./profile-types";

function isMissingRelationError(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "42P01" || error?.message?.includes("Could not find the table");
}

export async function getTravelerCountries(userId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("traveler_countries")
    .select("id,user_id,country_name,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) {
      return [] as TravelerCountry[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as TravelerCountry[];
}
