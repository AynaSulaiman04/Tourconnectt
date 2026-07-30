import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { DirectMessagesClient } from "@/components/messages/DirectMessagesClient";
import { getDirectMessagePageState } from "@/lib/supabase/direct-messages";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";

type OperatorMessagesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OperatorMessagesPage({ searchParams }: OperatorMessagesPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const profileContext = await getOptionalCurrentUserProfile();

  if (!profileContext?.profile) {
    redirect("/LoginPage?redirect=/OperatorMessages");
  }

  if (profileContext.profile.role !== "operator") {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  const state = await getDirectMessagePageState({
    profile: profileContext.profile,
    role: "operator",
    conversationId:
      typeof resolvedSearchParams.conversation === "string" && resolvedSearchParams.conversation.trim().length
        ? resolvedSearchParams.conversation.trim()
        : null,
    listingId:
      typeof resolvedSearchParams.listing === "string" && resolvedSearchParams.listing.trim().length
        ? resolvedSearchParams.listing.trim()
        : null,
    inquiryId:
      typeof resolvedSearchParams.inquiry === "string" && resolvedSearchParams.inquiry.trim().length
        ? resolvedSearchParams.inquiry.trim()
        : null,
    markAsSeen: true,
  });

  return (
    <PageShell
      contentClassName="page-shell-content--full-bleed"
      travelerProfile={{
        id: profileContext.profile.id,
        full_name: profileContext.profile.full_name,
        profile_image_url: profileContext.profile.profile_image_url,
        role: profileContext.profile.role,
      }}
      variant="operator"
    >
      <DirectMessagesClient
        currentUserId={profileContext.profile.id}
        currentUserRole={profileContext.profile.role as "operator"}
        key={[
          resolvedSearchParams.conversation,
          resolvedSearchParams.listing,
          resolvedSearchParams.inquiry,
        ]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .join(":") || "operator-direct-messages"}
        pageCopy="Review traveller messages from your own conversations and reply directly from the operator inbox."
        pageTitle="Operator inbox"
        returnTo="/OperatorDashboard"
        role="operator"
        state={state}
      />
    </PageShell>
  );
}
