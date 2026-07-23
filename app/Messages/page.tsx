import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { DirectMessagesClient } from "@/components/messages/DirectMessagesClient";
import { getDirectMessagePageState } from "@/lib/supabase/direct-messages";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";

type MessagesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const profileContext = await getOptionalCurrentUserProfile();
  const redirectParams = new URLSearchParams();

  if (typeof resolvedSearchParams.conversation === "string" && resolvedSearchParams.conversation.trim().length > 0) {
    redirectParams.set("conversation", resolvedSearchParams.conversation.trim());
  }

  if (typeof resolvedSearchParams.listing === "string" && resolvedSearchParams.listing.trim().length > 0) {
    redirectParams.set("listing", resolvedSearchParams.listing.trim());
  }

  if (typeof resolvedSearchParams.inquiry === "string" && resolvedSearchParams.inquiry.trim().length > 0) {
    redirectParams.set("inquiry", resolvedSearchParams.inquiry.trim());
  }

  if (!profileContext?.profile) {
    const query = new URLSearchParams();
    const redirectTarget = `/Messages${redirectParams.toString() ? `?${redirectParams.toString()}` : ""}`;
    query.set("redirect", redirectTarget);
    redirect(`/LoginPage?${query.toString()}`);
  }

  if (profileContext.profile.role === "operator") {
    redirect("/OperatorMessages");
  }

  if (profileContext.profile.role === "admin") {
    redirect(getRoleDashboardRoute("admin"));
  }

  const state = await getDirectMessagePageState({
    profile: profileContext.profile,
    role: "traveler",
    conversationId: getParam(resolvedSearchParams.conversation) || null,
    listingId: getParam(resolvedSearchParams.listing) || null,
    inquiryId: getParam(resolvedSearchParams.inquiry) || null,
    markAsSeen: true,
  });

  return (
    <PageShell
      variant="traveler"
      contentClassName="page-shell-content--full-bleed"
      travelerProfile={{
        id: profileContext.profile.id,
        full_name: profileContext.profile.full_name,
        profile_image_url: profileContext.profile.profile_image_url,
        role: profileContext.profile.role,
      }}
    >
      <DirectMessagesClient
        currentUserId={profileContext.profile.id}
        currentUserRole={profileContext.profile.role as "traveler"}
        key={[
          resolvedSearchParams.conversation,
          resolvedSearchParams.listing,
          resolvedSearchParams.inquiry,
        ]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .join(":") || "traveler-direct-messages"}
        aiLink="/ConciergeChat"
        pageCopy="Choose a listing or inquiry to speak with the operator directly, or switch to Concierge for travel ideas and recommendations."
        pageTitle="Traveler inbox"
        returnTo="/TravellerProfile"
        role="traveler"
        state={state}
      />
    </PageShell>
  );
}
