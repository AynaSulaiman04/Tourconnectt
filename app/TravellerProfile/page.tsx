import { PageShell } from "@/components/layout/PageShell";
import { getCurrentUserProfile } from "@/lib/supabase/profile";
import { getTravelerInquiryDashboard } from "@/lib/supabase/inquiry";
import { getDirectMessagePageState } from "@/lib/supabase/direct-messages";
import { recordPlatformEvent } from "@/lib/supabase/analytics";
import { getTravelerCareProfile } from "@/lib/supabase/traveler-care";
import { TravellerDashboardView } from "./traveller-dashboard";

type TravellerProfilePageProps = {
  searchParams: Promise<{
    payment?: string | string[];
    payment_error?: string | string[];
    tab?: string | string[];
  }>;
};

function normalizeSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function TravellerProfilePage({ searchParams }: TravellerProfilePageProps) {
  const resolvedSearchParams = await searchParams;
  const { authUser, profile } = await getCurrentUserProfile();

  await recordPlatformEvent({
    event_type: "profile_view",
    actor_profile_id: authUser.id,
    actor_role: profile.role,
    target_profile_id: profile.id,
    metadata: {
      page: "TravellerProfile",
    },
  });

  const [dashboard, directMessageState, careProfile] = await Promise.all([
    getTravelerInquiryDashboard(profile.id),
    getDirectMessagePageState({
      profile,
      role: "traveler",
      markAsSeen: false,
    }),
    getTravelerCareProfile(profile.id),
  ]);

  return (
    <PageShell
      travelerProfile={{
        id: profile.id,
        full_name: profile.full_name,
        profile_image_url: profile.profile_image_url,
        role: profile.role,
      }}
      variant="traveler"
    >
      <TravellerDashboardView
        dashboard={dashboard}
        directMessageState={directMessageState}
        paymentErrorMessage={normalizeSearchParam(resolvedSearchParams.payment_error)}
        paymentStatus={normalizeSearchParam(resolvedSearchParams.payment)}
        activeTab={normalizeSearchParam(resolvedSearchParams.tab) === "payments" ? "payments" : "overview"}
        profile={profile}
        careProfile={careProfile}
      />
    </PageShell>
  );
}
