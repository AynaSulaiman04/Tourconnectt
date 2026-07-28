"use server";

import { redirect } from "next/navigation";
import { requireOperatorProfile } from "@/lib/supabase/operator";

function getReturnTo(formData: FormData) {
  const value = String(formData.get("return_to") ?? "").trim();
  return value || "/OperatorUserManage";
}

function buildRedirectUrl(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export async function updateUserAccessAction(formData: FormData) {
  await requireOperatorProfile();
  const returnTo = getReturnTo(formData);
  redirect(buildRedirectUrl(returnTo, { error: "Only administrators can change account access." }));
}
