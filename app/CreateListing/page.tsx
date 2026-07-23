import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { getOperatorListingDraft, getOperatorListingDraftById } from "@/lib/supabase/operator-listings";
import { ListingEditor } from "./listing-editor";

type NewListingPageProps = {
  searchParams?: Promise<{
    draft?: string;
  }>;
};

export default async function NewListingPage({ searchParams }: NewListingPageProps) {
  const profileContext = await getOptionalCurrentUserProfile();
  const resolvedSearchParams = (await searchParams) ?? {};

  if (!profileContext?.profile) {
    redirect("/LoginPage");
  }

  if (profileContext.profile.role !== "operator") {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  const requestedDraftId =
    typeof resolvedSearchParams.draft === "string" && resolvedSearchParams.draft.trim().length
      ? resolvedSearchParams.draft.trim()
      : null;
  const draft = requestedDraftId
    ? (await getOperatorListingDraftById(profileContext.profile.id, requestedDraftId)) ?? (await getOperatorListingDraft(profileContext.profile.id))
    : await getOperatorListingDraft(profileContext.profile.id);

  return (
    <PageShell
      travelerProfile={{
        id: profileContext.profile.id,
        full_name: profileContext.profile.full_name,
        profile_image_url: profileContext.profile.profile_image_url,
        role: profileContext.profile.role,
      }}
      variant="operator"
    >
      <ListingEditor
        initialDraft={draft}
        operatorName={profileContext.profile.full_name}
      />
    </PageShell>
  );
}
