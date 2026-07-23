import { PageShell } from "@/components/layout/PageShell";
import { ConciergeChatClient } from "@/components/concierge/ConciergeChatClient";
import { buildConciergeContext } from "@/lib/ai/concierge-context";
import { getConciergePageState } from "@/lib/ai/concierge-store";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { redirect } from "next/navigation";

type ConciergeChatPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConciergeChatPage({ searchParams }: ConciergeChatPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const conversationId =
    typeof resolvedSearchParams.conversation === "string" && resolvedSearchParams.conversation.trim().length > 0
      ? resolvedSearchParams.conversation.trim()
      : null;

  const profileContext = await getOptionalCurrentUserProfile().catch(() => null);

  if (profileContext?.profile && profileContext.profile.role && !["traveler", "operator", "admin"].includes(profileContext.profile.role)) {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  const initialContext = await buildConciergeContext({
    query: "",
    userId: profileContext?.profile?.id ?? null,
  }).catch(() => ({
    query: "",
    traveler: null,
    recommendations: [],
    knowledgeSources: [],
    sourceSummaries: [],
    promptContext: [
      "TT Connect platform context:",
      "- No live platform data is available right now.",
      "Rules:",
      "- Use only the provided platform context for listings, pricing, and availability.",
      "- If a price or availability is missing, say the operator will confirm it.",
      "- Keep the reply friendly, concise, and helpful.",
    ].join("\n"),
  }));

  const pageState = profileContext?.profile
    ? await getConciergePageState({
        userId: profileContext.profile.id,
        conversationId,
      })
    : {
        conversations: [],
        activeConversation: null,
        messages: [],
      };

  return (
    <PageShell
      variant="public"
      contentClassName="concierge-page-shell"
      travelerProfile={
        profileContext?.profile
          ? {
              id: profileContext.profile.id,
              full_name: profileContext.profile.full_name,
              profile_image_url: profileContext.profile.profile_image_url,
              role: profileContext.profile.role,
            }
          : null
      }
    >
      <ConciergeChatClient
        key={conversationId ?? "new-conversation"}
        aiConfigured={Boolean(process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim())}
        conversations={pageState.conversations}
        currentConversationId={pageState.activeConversation?.id ?? null}
        currentConversationTitle={pageState.activeConversation?.title ?? null}
        isAuthenticated={Boolean(profileContext?.profile)}
        knowledgeSources={initialContext.knowledgeSources}
        messages={pageState.messages}
        recommendations={initialContext.recommendations}
      />
    </PageShell>
  );
}
