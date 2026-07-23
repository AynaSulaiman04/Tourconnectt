"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireOperatorProfile } from "@/lib/supabase/operator";
import { clearPortalAuthCookie } from "@/lib/supabase/portal-auth";

function getReturnTo(formData: FormData) {
  const value = String(formData.get("return_to") ?? "").trim();
  return value || "/OperatorSettings";
}

function getBoolean(formData: FormData, name: string) {
  const value = formData.get(name);
  if (value === null) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "";
}

function buildRedirectUrl(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, "http://tt-connect.local");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export async function updateOperatorSettingsAction(formData: FormData) {
  const profile = await requireOperatorProfile();
  const returnTo = getReturnTo(formData);

  const responseCadence = String(formData.get("response_cadence") ?? "").trim();
  const bookingWorkflow = String(formData.get("booking_workflow") ?? "").trim();
  const customerRecords = String(formData.get("customer_records") ?? "").trim();
  const communicationMode = String(formData.get("communication_mode") ?? "").trim();

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("operator_settings").upsert(
    {
      id: profile.id,
      response_cadence: responseCadence || "fast_turnaround",
      booking_workflow: bookingWorkflow || "inquiry_first",
      customer_records: customerRecords || "documented",
      communication_mode: communicationMode || "email_whatsapp",
      inquiry_received_enabled: getBoolean(formData, "inquiry_received_enabled"),
      booking_approved_enabled: getBoolean(formData, "booking_approved_enabled"),
      guest_message_enabled: getBoolean(formData, "guest_message_enabled"),
      customer_note_enabled: getBoolean(formData, "customer_note_enabled"),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("Unable to save operator settings", { profileId: profile.id, error: error.message });
    redirect(buildRedirectUrl(returnTo, { error: "We could not save operator settings. Please try again." }));
  }

  revalidatePath("/OperatorSettings");
  redirect(buildRedirectUrl(returnTo, { saved: "1" }));
}

export async function revokeOperatorSessionAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  await clearPortalAuthCookie(await cookies());
  redirect("/LoginPage?auth=logged_out");
}
