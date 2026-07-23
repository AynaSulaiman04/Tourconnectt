import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/profile";

export default async function AccountSettingPage() {
  await getCurrentUserProfile();
  redirect("/TravellerProfile");
}
