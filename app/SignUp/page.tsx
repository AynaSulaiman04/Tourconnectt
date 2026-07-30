import { redirect } from "next/navigation";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { PageShell } from "@/components/layout/PageShell";
import { SignupForm } from "./signup-form";
import { signUpTravelerAction } from "./actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { getAuthHeroImages } from "@/lib/auth-hero-images";

export default async function SignUpPage() {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (authData.user) {
    const profileContext = await getOptionalCurrentUserProfile();
    if (profileContext?.profile) {
      redirect(getRoleDashboardRoute(profileContext.profile.role));
    }
  }

  const heroImages = await getAuthHeroImages();

  return (
    <PageShell authResolved variant="public">
      <AuthPageLayout
        description="Create your private traveller profile."
        heroImages={heroImages}
        title="Sign Up"
        footer={<p>&copy; 2026 Tour ConnecTT. All rights reserved.</p>}
      >
        <SignupForm action={signUpTravelerAction} variant="traveler" />
      </AuthPageLayout>
    </PageShell>
  );
}
