"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearPortalAuthCookie } from "@/lib/supabase/portal-auth";

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();

  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Unable to sign out cleanly", error);
  }

  await clearPortalAuthCookie(await cookies());
  redirect("/");
}
