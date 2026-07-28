import { redirect } from "next/navigation";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";

export default async function OperatorSignUpPage() {
  const profileContext = await getOptionalCurrentUserProfile();

  if (profileContext?.profile) {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  redirect("/OperatorLogin?signup=invite-only");
}
