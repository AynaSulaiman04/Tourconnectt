import "server-only";

import { createSupabaseServiceRoleClient } from "./server";

type ServiceRoleClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
};

function normalizeCandidate(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export async function resolveOperatorProfileId(
  admin: ServiceRoleClient,
  candidates: Array<string | null | undefined>,
) {
  const values = [...new Set(candidates.map(normalizeCandidate).filter((value): value is string => Boolean(value)))];

  for (const value of values) {
    const queries = [
      admin.from("profiles").select("id,full_name,email,role").eq("role", "operator").eq("full_name", value),
      admin.from("profiles").select("id,full_name,email,role").eq("role", "operator").eq("email", value),
      admin.from("profiles").select("id,full_name,email,role").eq("role", "operator").ilike("full_name", value),
    ] as const;

    for (const query of queries) {
      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      const match = (data ?? []).find((entry) => entry.role === "operator") as ProfileRow | undefined;
      if (match) {
        return match.id;
      }
    }
  }

  const { data, error } = await admin.from("profiles").select("id,full_name,email,role").eq("role", "operator").limit(2);

  if (error) {
    throw new Error(error.message);
  }

  const operators = (data ?? []).filter((entry) => entry.role === "operator") as ProfileRow[];
  if (operators.length === 1) {
    return operators[0].id;
  }

  return null;
}
