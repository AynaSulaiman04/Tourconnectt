"use client";

import "@/components/messages/InboxShell.css";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { DirectConversationSummary, DirectMessagePageState, DirectMessageRecord, DirectMessageRouteRole } from "@/lib/supabase/direct-messages";
import { Button } from "@/components/ui/Button";
import { InboxShell, type InboxConversationItem, type InboxMessageItem } from "@/components/messages/InboxShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatDateTimeUtc } from "@/lib/format/date";

type DirectMessagesClientProps = {
  currentUserId: string;
  currentUserRole: DirectMessageRouteRole;
  role: DirectMessageRouteRole;
  pageTitle: string;
  pageCopy: string;
  aiLink?: string | null;
  returnTo?: string;
  state: DirectMessagePageState;
};

function formatMessageTime(value: string | null | undefined) {
  if (!value) {
    return "Just now";
  }

  return formatDateTimeUtc(value, "Just now");
}

function buildConversationHref(pathname: string, conversationId: string) {
  const url = new URL(pathname, "http://tt-connect.local");
  url.searchParams.set("conversation", conversationId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

const EMOJI_OPTIONS = ["??", "??", "??", "?", "??"];
const FALLBACK_POLL_INTERVAL_MS = 120_000;

function resolveCounterpartAvatar(
  role: DirectMessageRouteRole,
  conversation: Pick<DirectConversationSummary, "operator_image_url" | "traveler_image_url">,
) {
  return role === "traveler"
    ? conversation.operator_image_url ?? conversation.traveler_image_url ?? null
    : conversation.traveler_image_url ?? conversation.operator_image_url ?? null;
}

export function DirectMessagesClient({
  currentUserId,
  currentUserRole,
  role,
  pageTitle,
  pageCopy,
  aiLink,
  returnTo,
  state,
}: DirectMessagesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const syncMessagesRef = useRef<(() => Promise<void>) | null>(null);
  const realtimeConnectedRef = useRef(false);
  const requestedConversationId = searchParams.get("conversation");
  const initialConversationId = state.activeConversation?.id ?? requestedConversationId ?? state.conversations[0]?.id ?? null;

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversations, setConversations] = useState<DirectConversationSummary[]>(state.conversations);
  const [messages, setMessages] = useState<DirectMessageRecord[]>(state.messages);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialConversationId);
  const [context] = useState(state.context);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [selectedAttachmentName, setSelectedAttachmentName] = useState<string | null>(null);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const lastSeenMessageIdRef = useRef<string | null>(state.messages.at(-1)?.id ?? null);
  const searchQuery = searchParams.toString();

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  const activeMessages = useMemo(
    () => (activeConversation ? messages.filter((message) => message.conversation_id === activeConversation.id) : []),
    [activeConversation, messages],
  );
  const canSendMessage = Boolean(draft.trim() && (activeConversationId || context?.listingId || context?.inquiryId));
  const visibleConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const haystack = [
        conversation.title,
        conversation.subtitle,
        conversation.last_message_preview,
        conversation.operator_name,
        conversation.traveler_name,
        conversation.listing_title,
        conversation.listing_location,
        conversation.inquiry_status,
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [conversationSearch, conversations]);

  useEffect(() => {
    lastSeenMessageIdRef.current = activeMessages.at(-1)?.id ?? null;
  }, [activeConversationId, activeMessages]);

  useEffect(() => {
    if (!liveNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setLiveNotice(null);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [liveNotice]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let active = true;
    let inFlight = false;
    let activeRequest: AbortController | null = null;

    async function syncDirectMessages() {
      if (inFlight) {
        return;
      }

      inFlight = true;
      activeRequest = new AbortController();

      try {
        const response = await fetch(`/api/direct-messages${searchQuery ? `?${searchQuery}` : ""}`, {
          cache: "no-store",
          signal: activeRequest.signal,
        });

        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              conversations?: DirectConversationSummary[];
              activeConversation?: DirectConversationSummary | null;
              messages?: DirectMessageRecord[];
            }
          | null;

        if (!active || !response.ok || !payload?.ok) {
          return;
        }

        const nextConversations = Array.isArray(payload.conversations) ? payload.conversations : [];
        const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];
        const nextActiveConversationId = payload.activeConversation?.id ?? null;
        const nextLatestMessage = nextMessages.at(-1) ?? null;
        const previousLatestMessageId = lastSeenMessageIdRef.current;

        setConversations(nextConversations);
        setMessages(nextMessages);
        setActiveConversationId((current) => {
          if (nextActiveConversationId) {
            return nextActiveConversationId;
          }

          if (current && nextConversations.some((conversation) => conversation.id === current)) {
            return current;
          }

          return nextConversations[0]?.id ?? null;
        });

        if (
          nextLatestMessage &&
          nextLatestMessage.id !== previousLatestMessageId &&
          nextLatestMessage.sender_role !== role
        ) {
          setLiveNotice(
            role === "traveler"
              ? "New message from your operator"
              : "New traveller reply received",
          );
        }

        lastSeenMessageIdRef.current = nextLatestMessage?.id ?? previousLatestMessageId;
      } catch {
        // Quiet polling failures are acceptable; the page will keep the last known state.
      } finally {
        activeRequest = null;
        inFlight = false;
      }
    }

    syncMessagesRef.current = syncDirectMessages;
    void syncDirectMessages();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !realtimeConnectedRef.current) {
        void syncDirectMessages();
      }
    }, FALLBACK_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !realtimeConnectedRef.current) {
        void syncDirectMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      activeRequest?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (syncMessagesRef.current === syncDirectMessages) {
        syncMessagesRef.current = null;
      }
    };
  }, [role, searchQuery]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let active = true;
    const expectedChannelCount = activeConversationId ? 2 : 1;
    const subscribedChannels = new Set<string>();
    realtimeConnectedRef.current = false;

    const refreshFromRealtime = () => {
      if (!active) {
        return;
      }

      void syncMessagesRef.current?.();
    };

    const updateRealtimeStatus = (channelKey: string, status: string) => {
      if (!active) {
        return;
      }

      if (status === "SUBSCRIBED") {
        subscribedChannels.add(channelKey);
      } else {
        subscribedChannels.delete(channelKey);
      }

      const wasConnected = realtimeConnectedRef.current;
      realtimeConnectedRef.current = subscribedChannels.size === expectedChannelCount;

      if (realtimeConnectedRef.current && !wasConnected) {
        void syncMessagesRef.current?.();
      }
    };

    const conversationChannelKey = `conversations:${currentUserRole}:${currentUserId}`;
    const conversationChannel = supabase
      .channel(`direct-messages-conversations:${currentUserRole}:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "traveler_operator_conversations",
          filter: `${currentUserRole === "traveler" ? "traveler_id" : "operator_id"}=eq.${currentUserId}`,
        },
        refreshFromRealtime,
      );
    const channels = [
      conversationChannel.subscribe((status) => updateRealtimeStatus(conversationChannelKey, status)),
    ];

    if (activeConversationId) {
      const threadChannelKey = `thread:${activeConversationId}`;
      const threadChannel = supabase
        .channel(`direct-messages-thread:${activeConversationId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "traveler_operator_messages",
            filter: `conversation_id=eq.${activeConversationId}`,
          },
          refreshFromRealtime,
        );

      channels.push(
        threadChannel.subscribe((status) => updateRealtimeStatus(threadChannelKey, status)),
      );
    }

    return () => {
      active = false;
      realtimeConnectedRef.current = false;
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [activeConversationId, currentUserId, currentUserRole]);

  async function handleSendMessage() {
    const trimmed = draft.trim();
    if (!trimmed || pending || !canSendMessage) {
      return;
    }

    setPending(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch("/api/direct-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          conversationId: activeConversationId,
          listingId: context?.listingId,
          inquiryId: context?.inquiryId,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            conversationId?: string | null;
            conversations?: DirectConversationSummary[];
            messages?: DirectMessageRecord[];
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Unable to send the message.");
      }

      if (Array.isArray(payload.conversations)) {
        setConversations(payload.conversations);
      }

      if (Array.isArray(payload.messages)) {
        setMessages(payload.messages);
      }

      if (payload.conversationId) {
        setActiveConversationId(payload.conversationId);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("conversation", payload.conversationId);
        nextUrl.searchParams.delete("listing");
        nextUrl.searchParams.delete("inquiry");
        router.replace(`${nextUrl.pathname}?${nextUrl.searchParams.toString()}`, { scroll: false });
      }

      setDraft("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send the message.");
    } finally {
      window.clearTimeout(timeoutId);
      setPending(false);
    }
  }

  function handleSelectConversation(conversationId: string) {
    const selectedConversation = conversations.find((conversation) => conversation.id === conversationId) ?? null;
    const nextHref = selectedConversation?.launch_href ?? buildConversationHref(pathname, conversationId);

    setActiveConversationId(conversationId);
    router.replace(nextHref, { scroll: false });
  }

  function handleAttachmentPick() {
    attachmentInputRef.current?.click();
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;

    if (!file) {
      return;
    }

    const attachmentLabel = `[Attachment selected: ${file.name}]`;

    setSelectedAttachmentName(file.name);
    setDraft((current) => {
      if (current.includes(attachmentLabel)) {
        return current;
      }

      return current.trim().length > 0 ? `${current.trimEnd()}\n\n${attachmentLabel}` : attachmentLabel;
    });
    setLiveNotice("Attachment name added to your draft.");
    setShowEmojiTray(false);
    event.currentTarget.value = "";
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleEmojiPick(emoji: string) {
    setDraft((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${emoji}`);
    setShowEmojiTray(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  const inboxConversations: InboxConversationItem[] = visibleConversations.map((conversation) => ({
    id: conversation.id,
    name: conversation.counterpart_name,
    tripTitle: conversation.listing_title ?? conversation.inquiry_destination ?? conversation.subtitle,
    preview: conversation.last_message_preview,
    time: formatMessageTime(conversation.last_message_at ?? conversation.updated_at),
    unreadCount: conversation.unread_count,
    avatarUrl: resolveCounterpartAvatar(role, conversation),
    active: conversation.id === activeConversationId,
  }));

  const inboxMessages: InboxMessageItem[] = activeMessages.map((message) => {
    const isOwnMessage = message.sender_role === currentUserRole || message.sender_id === currentUserId;

    return {
      id: message.id,
      body: message.message,
      time: formatMessageTime(message.created_at),
      sender: isOwnMessage ? "You" : role === "traveler" ? "Operator" : "Traveller",
      mine: isOwnMessage,
    };
  });

  const activeConversationSummary = activeConversation
    ? {
        name: activeConversation.counterpart_name,
        tripTitle: activeConversation.listing_title ?? activeConversation.inquiry_destination ?? activeConversation.subtitle,
        status: activeConversation.inquiry_status ?? activeConversation.status,
        avatarUrl: resolveCounterpartAvatar(role, activeConversation),
        destination: context?.listingLocation ?? activeConversation.listing_location ?? activeConversation.inquiry_destination ?? null,
        dates: context?.datesLabel ?? null,
        guests: null,
        inquiryStatus: activeConversation.inquiry_status ?? null,
      }
    : null;

  const hasContextDetails = Boolean(
    activeConversationSummary?.destination ||
      activeConversationSummary?.dates ||
      activeConversationSummary?.guests ||
      activeConversationSummary?.inquiryStatus,
  );
  const composerStatus = error ?? liveNotice ?? (selectedAttachmentName ? `Selected file: ${selectedAttachmentName}` : null);

  return (
    <InboxShell
      shellClassName={isExpanded ? "is-expanded" : "is-compact"}
      conversations={inboxConversations}
      activeConversation={activeConversationSummary}
      messages={inboxMessages}
      messageValue={draft}
      onMessageChange={setDraft}
      onSendMessage={() => void handleSendMessage()}
      onSelectConversation={handleSelectConversation}
      title={pageTitle}
      copy={pageCopy}
      sidebarCopy={null}
      searchValue={conversationSearch}
      onSearchChange={setConversationSearch}
      searchPlaceholder="Search conversations..."
      sidebarActions={
        <>
          {aiLink && role === "traveler" ? (
            <Button aria-label="Ask AI Concierge" href={aiLink} variant="ghost" className="tc-icon-button">
              <span className="material-symbols-outlined" aria-hidden="true">
                auto_awesome
              </span>
            </Button>
          ) : null}
          {returnTo ? (
            <Button aria-label="Return" href={returnTo} variant="ghost" className="tc-icon-button">
              <span className="material-symbols-outlined" aria-hidden="true">
                arrow_back
              </span>
            </Button>
          ) : null}
        </>
      }
      headerBadge={activeConversation?.inquiry_status ? <span className="page-badge">{activeConversation.inquiry_status}</span> : null}
      headerActions={
        <>
          <button
            className="tc-icon-button"
            type="button"
            aria-label={hasContextDetails ? "Conversation details available above" : "Conversation details unavailable"}
            title="Conversation details"
            onClick={() => {
              setLiveNotice(
                hasContextDetails ? "Conversation details are shown above the thread." : "No extra details are available for this thread yet.",
              );
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              info
            </span>
          </button>
          <button
            className="tc-icon-button"
            type="button"
            aria-label={isExpanded ? "Use compact inbox layout" : "Expand inbox layout"}
            title={isExpanded ? "Use compact inbox layout" : "Expand inbox layout"}
            onClick={() => setIsExpanded((current) => !current)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {isExpanded ? "fullscreen_exit" : "open_in_full"}
            </span>
          </button>
        </>
      }
      leftHeaderIcon={
        <span className="material-symbols-outlined" aria-hidden="true">
          edit
        </span>
      }
      composerLeadingAction={
        <>
          <button
            className="tc-composer-action"
            type="button"
            aria-label="Select a file name for this message"
            title="Add a file label"
            onClick={handleAttachmentPick}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              attach_file
            </span>
          </button>
          <input
            ref={attachmentInputRef}
            type="file"
            className="tc-hidden-file-input"
            onChange={handleAttachmentChange}
            aria-hidden="true"
            tabIndex={-1}
          />
        </>
      }
      composerTrailingAction={
        <div className="tc-emoji-wrap">
          {showEmojiTray ? (
            <div className="tc-emoji-tray" role="listbox" aria-label="Suggested emoji">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className="tc-emoji-option"
                  type="button"
                  onClick={() => handleEmojiPick(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
          <button
            className="tc-composer-action"
            type="button"
            aria-label="Add emoji"
            title="Add emoji"
            onClick={() => setShowEmojiTray((current) => !current)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              sentiment_satisfied
            </span>
          </button>
        </div>
      }
      composerHint="Your conversations are secure and private."
      composerPlaceholder={role === "traveler" ? "Write a message to the operator..." : "Write a reply to the traveller..."}
      sendLabel={pending ? "Sending..." : "Send Message"}
      statusNotice={
        composerStatus ? (
          <div className={`tc-inline-notice ${error ? "is-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">
            {composerStatus}
          </div>
        ) : null
      }
      emptyStateTitle={activeConversation ? "No messages in this thread yet" : "Select a conversation to reply."}
      emptyStateCopy={
        activeConversation
          ? "Send a reply below to keep the conversation going."
          : role === "traveler"
            ? "Choose an operator thread from the inbox to continue your trip planning."
            : "Select an existing traveller thread from the inbox to reply."
      }
      emptySidebarTitle="No conversations yet"
      emptySidebarCopy={
        role === "traveler"
          ? "Choose a listing or inquiry to start talking with the operator."
          : "Traveller conversations will appear here once they send a direct message."
      }
    />
  );
}
