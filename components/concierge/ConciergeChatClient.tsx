"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import type {
  ConciergeConversationSummary,
  ConciergeMessageRecord,
} from "@/lib/ai/concierge-store";
import type {
  ConciergeKnowledgeSource,
  ConciergeRecommendation,
} from "@/lib/ai/concierge-context";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type ConciergeClientMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  sources?: ConciergeSourceEntry[];
};

type ConciergeSourceEntry = {
  id: string;
  sourceType: "listing" | "knowledge_source";
  title: string;
  url: string | null;
  excerpt: string;
  metadata: Record<string, unknown> | null;
};

type ConciergeChatClientProps = {
  isAuthenticated: boolean;
  aiConfigured: boolean;
  currentConversationId: string | null;
  currentConversationTitle: string | null;
  conversations: ConciergeConversationSummary[];
  messages: ConciergeMessageRecord[];
  recommendations: ConciergeRecommendation[];
  knowledgeSources: ConciergeKnowledgeSource[];
};

type ConciergeChatResponsePayload = {
  ok?: boolean;
  conversationId?: string | null;
  conversationTitle?: string | null;
  assistantMessage?: ConciergeClientMessage;
  recommendations?: ConciergeRecommendation[];
  error?: string;
  configurationError?: string;
  storageWarning?: string | null;
};

type ResettableState<T> = {
  sourceValue: T;
  value: T;
};

const CHAT_REQUEST_TIMEOUT_MS = 60_000;

function subscribeToHydration() {
  return () => {};
}

function getHydratedSnapshot() {
  return true;
}

function getServerHydratedSnapshot() {
  return false;
}

function useResettableState<T>(sourceValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<ResettableState<T>>(() => ({
    sourceValue,
    value: sourceValue,
  }));
  const value = Object.is(state.sourceValue, sourceValue) ? state.value : sourceValue;

  const setValue: Dispatch<SetStateAction<T>> = (nextValue) => {
    setState((current) => {
      const currentValue = Object.is(current.sourceValue, sourceValue)
        ? current.value
        : sourceValue;

      return {
        sourceValue,
        value:
          typeof nextValue === "function"
            ? (nextValue as (previousValue: T) => T)(currentValue)
            : nextValue,
      };
    });
  };

  return [value, setValue];
}

async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMessage: string,
) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CHAT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    let payload: T | null = null;

    try {
      payload = (await response.json()) as T;
    } catch (parseError) {
      if (controller.signal.aborted) {
        throw parseError;
      }
    }

    return { response, payload };
  } catch (requestError) {
    if (timedOut) {
      throw new Error(timeoutMessage);
    }

    throw requestError;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function formatRelativeTime(value: string | null | undefined, referenceTime = Date.now()) {
  if (!value) {
    return "Just now";
  }

  const diffMs = referenceTime - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 min ago" : `${diffMinutes} mins ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hr ago" : `${diffHours} hrs ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value),
  );
}

function normalizeSourceEntries(message: ConciergeMessageRecord): ConciergeSourceEntry[] {
  if (!Array.isArray(message.sources)) {
    return [];
  }

  return message.sources
    .map((entry) => entry as ConciergeSourceEntry | undefined)
    .filter((entry): entry is ConciergeSourceEntry => Boolean(entry?.title));
}

function toClientMessages(messages: ConciergeMessageRecord[]): ConciergeClientMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
    sources: normalizeSourceEntries(message),
  }));
}

function buildTempMessageId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function loadInitialChatMessages(
  messages: ConciergeMessageRecord[],
  currentConversationId: string | null,
) {
  if (typeof window !== "undefined" && currentConversationId) {
    const saved = window.sessionStorage.getItem(`concierge-thread:${currentConversationId}`);

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ConciergeClientMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // Ignore malformed session cache and continue with server data.
      }
    }
  }

  return toClientMessages(messages);
}

function renderInlineText(value: string) {
  const urlPattern = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push(value.slice(lastIndex, match.index));
    }

    const url = match[0];
    parts.push(
      <Link key={`${url}-${match.index}`} href={url} rel="noreferrer" target="_blank">
        {url}
      </Link>,
    );
    lastIndex = match.index + url.length;
  }

  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }

  return parts;
}

function renderMessageContent(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const blocks = normalized.split(/\n{2,}/).filter((block) => block.trim().length > 0);

  if (blocks.length === 0) {
    return <p className="message-paragraph">{renderInlineText(content)}</p>;
  }

  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n");
        const ordered = lines.every((line) => /^\s*\d+[\.)]\s+/.test(line));
        const unordered = lines.every((line) => /^\s*[-*•]\s+/.test(line));

        if (ordered || unordered) {
          const ListTag = (ordered ? "ol" : "ul") as "ol" | "ul";

          return (
            <ListTag key={`block-${blockIndex}`} className="message-list">
              {lines.map((line, lineIndex) => (
                <li key={`${blockIndex}-${lineIndex}`}>{renderInlineText(line.replace(/^\s*(?:\d+[\.)]|[-*•])\s+/, ""))}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={`block-${blockIndex}`} className="message-paragraph">
            {lines.map((line, lineIndex) => (
              <span key={`${blockIndex}-${lineIndex}`}>
                {renderInlineText(line)}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

export function ConciergeChatClient({
  isAuthenticated,
  aiConfigured,
  currentConversationId,
  currentConversationTitle,
  messages,
  recommendations,
}: ConciergeChatClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatActionsRef = useRef<HTMLDivElement | null>(null);
  const initialChatMessages = useMemo(
    () => loadInitialChatMessages(messages, currentConversationId),
    [currentConversationId, messages],
  );

  const [draft, setDraft] = useState("");
  const [chatMessages, setChatMessages] = useResettableState(initialChatMessages);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const [activeConversationId, setActiveConversationId] =
    useResettableState(currentConversationId);
  const [activeConversationTitle, setActiveConversationTitle] =
    useResettableState(currentConversationTitle);
  const [suggestedListings, setSuggestedListings] = useResettableState(recommendations);
  const [showSuggestedListings, setShowSuggestedListings] = useState(false);
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !activeConversationId) {
      return;
    }

    window.sessionStorage.setItem(`concierge-thread:${activeConversationId}`, JSON.stringify(chatMessages));
  }, [activeConversationId, chatMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, pending, suggestedListings]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick(Date.now());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (chatActionsRef.current && event.target instanceof Node && !chatActionsRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function renderRelativeTime(value: string | null | undefined) {
    if (!isHydrated) {
      return "Just now";
    }

    return formatRelativeTime(value, tick);
  }

  const conversationLabel = activeConversationTitle ?? "Ask live questions";

  async function sendMessage(messageText: string) {
    const trimmed = messageText.trim();
    if (!trimmed || pending || !isAuthenticated) {
      return;
    }

    setPending(true);
    setError(null);

    const optimisticUserMessage: ConciergeClientMessage = {
      id: buildTempMessageId("temp-user"),
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
      sources: [],
    };

    setChatMessages((current) => [...current, optimisticUserMessage]);
    setDraft("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;

      const { response, payload } =
        await fetchJsonWithTimeout<ConciergeChatResponsePayload>(
          "/api/concierge/chat",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
              message: trimmed,
              conversationId: activeConversationId,
            }),
          },
          "The concierge response timed out. Please try again.",
        );

      if (!response.ok || !payload?.ok) {
        const nextError = payload?.configurationError ?? payload?.error ?? "Unable to send your message right now.";
        throw new Error(nextError);
      }

      if (payload.conversationId) {
        setActiveConversationId(payload.conversationId);
      }

      if (payload.conversationTitle) {
        setActiveConversationTitle(payload.conversationTitle);
      }

      if (payload.storageWarning) {
        setStorageNotice(payload.storageWarning);
      } else {
        setStorageNotice(null);
      }

      if (payload.assistantMessage) {
        const assistant = payload.assistantMessage;
        setChatMessages((current) => [
          ...current,
          {
            id: assistant.id ?? buildTempMessageId("temp-assistant"),
            role: "assistant",
            content: assistant.content,
            created_at: assistant.created_at ?? new Date().toISOString(),
            sources: assistant.sources ?? [],
          },
        ]);
      }

      if (Array.isArray(payload.recommendations)) {
        setSuggestedListings(payload.recommendations);
        if (payload.recommendations.length > 0) {
          setShowSuggestedListings(true);
        }
      }

      if (payload.conversationId) {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("conversation", payload.conversationId);
        router.replace(`${currentUrl.pathname}?${currentUrl.searchParams.toString()}`, { scroll: false });
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send your message right now.");
    } finally {
      setPending(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function performConversationAction(action: "new" | "clear") {
    if (!isAuthenticated) {
      setStatusNotice("Sign in to manage concierge chats.");
      return;
    }

    setMenuOpen(false);
    setError(null);
    setStatusNotice(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;

      const { response, payload } =
        await fetchJsonWithTimeout<ConciergeChatResponsePayload>(
          "/api/concierge/chat",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
              action,
              conversationId: activeConversationId,
            }),
          },
          "The concierge update timed out. Please try again.",
        );

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Unable to update concierge chat right now.");
      }

      const nextConversationId = payload.conversationId ?? null;
      const nextConversationTitle = payload.conversationTitle ?? null;

      setActiveConversationId(nextConversationId);
      setActiveConversationTitle(nextConversationTitle);
      setChatMessages([]);
      setDraft("");
      setShowSuggestedListings(false);

      if (nextConversationId) {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("conversation", nextConversationId);
        router.replace(`${currentUrl.pathname}?${currentUrl.searchParams.toString()}`, { scroll: false });
      } else {
        router.replace("/ConciergeChat", { scroll: false });
      }

      setStatusNotice(action === "clear" ? "Chat cleared. A fresh conversation is ready." : "New chat started.");

      if (Array.isArray(payload.recommendations)) {
        setSuggestedListings(payload.recommendations);
      }
    } catch (conversationError) {
      setError(
        conversationError instanceof Error
          ? conversationError.message
          : "Unable to update concierge chat right now.",
      );
    }
  }

  async function copyLastResponse() {
    const lastAssistantMessage = [...chatMessages].reverse().find((message) => message.role === "assistant");

    if (!lastAssistantMessage) {
      setStatusNotice("There is no assistant reply to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(lastAssistantMessage.content);
      setStatusNotice("Last response copied to clipboard.");
      setMenuOpen(false);
    } catch {
      setError("We could not copy the last response. Please try again.");
    }
  }

  function refreshSuggestions() {
    setSuggestedListings(recommendations);
    setShowSuggestedListings(true);
    setStatusNotice("Suggestions refreshed.");
    setMenuOpen(false);
    router.refresh();
  }

  function handleAttachmentClick() {
    setStatusNotice("File attachments are not available for Concierge yet.");
    setMenuOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(draft);
  }

  return (
    <div className="concierge-root">
      <style>{`
        .concierge-page-shell {
          width: 100%;
          max-width: none;
          height: calc(100dvh - 5.5rem);
          overflow: hidden;
        }

        .concierge-root {
          width: 100%;
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          color: var(--on-surface);
          overflow: hidden;
        }

        .concierge-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
          width: 100%;
          height: 100%;
          min-height: 0;
          padding: 0.9rem 0 1rem;
          align-items: stretch;
        }

        .concierge-rail {
          display: none;
        }

        .concierge-main {
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          height: 100%;
          max-height: 100%;
          border: 1px solid var(--outline-variant);
          border-radius: 1.7rem;
          background:
            radial-gradient(circle at top right, rgba(167, 67, 31, 0.035), transparent 24%),
            rgba(255, 253, 251, 0.88);
          box-shadow: var(--shadow-soft);
          overflow: hidden;
        }

        .concierge-panel-header,
        .concierge-panel-footer {
          padding: 1.6rem 1.45rem;
        }

        .concierge-panel-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }

        .concierge-panel-header {
          border-bottom: 1px solid var(--outline-variant);
        }

        .concierge-panel-footer {
          border-top: 1px solid var(--outline-variant);
        }

        .concierge-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(2rem, 2.5vw, 3.2rem);
          line-height: 0.96;
          letter-spacing: -0.04em;
          font-weight: 300;
        }

        .concierge-copy {
          margin: 0.6rem 0 0;
          color: var(--on-surface-variant);
          font-size: 0.96rem;
          line-height: 1.6;
        }

        .conversation-list,
        .current-chat-card,
        .concierge-panel-footer,
        .concierge-panel-header {
          display: none;
        }

        .current-chat-summary {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 0.86rem;
          line-height: 1.55;
        }

        .conversation-card {
          display: grid;
          gap: 0.3rem;
          padding: 0.95rem 1rem;
          border-radius: 1.1rem;
          border: 1px solid var(--outline-variant);
          background: rgba(255, 253, 251, 0.82);
          transition: transform 150ms ease, border-color 150ms ease, background-color 150ms ease;
        }

        .conversation-card:hover {
          transform: translateY(-1px);
          border-color: rgba(167, 67, 31, 0.24);
          background: rgba(255, 253, 251, 0.95);
        }

        .conversation-card.active {
          border-color: rgba(167, 67, 31, 0.32);
          background: rgba(243, 222, 214, 0.72);
        }

        .conversation-label {
          margin: 0;
          color: var(--secondary);
          font-size: 0.7rem;
          line-height: 1.3;
          letter-spacing: 0.16em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .conversation-title {
          margin: 0;
          color: var(--on-surface);
          font-size: 0.96rem;
          line-height: 1.3;
          font-weight: 600;
        }

        .conversation-preview {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 0.82rem;
          line-height: 1.5;
        }

        .conversation-meta {
          margin: 0.2rem 0 0;
          color: var(--on-surface-variant);
          font-size: 0.72rem;
          line-height: 1.3;
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 1.5rem 1.45rem 1.35rem;
          border-bottom: 1px solid var(--outline-variant);
          background: rgba(255, 253, 251, 0.7);
        }

        .chat-header h1 {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(1.8rem, 2vw, 2.6rem);
          line-height: 1;
          letter-spacing: -0.04em;
          font-weight: 300;
        }

        .chat-subtitle {
          margin: 0.55rem 0 0;
          color: var(--on-surface-variant);
          font-size: 0.92rem;
          line-height: 1.5;
        }

        .chat-actions {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-shrink: 0;
          position: relative;
        }

        .icon-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.8rem;
          height: 2.8rem;
          border-radius: 999px;
          border: 1px solid var(--outline-variant);
          background: rgba(255, 253, 251, 0.82);
          color: var(--on-surface-variant);
          transition: transform 150ms ease, background-color 150ms ease, border-color 150ms ease;
        }

        .icon-button:hover {
          transform: translateY(-1px);
          border-color: rgba(167, 67, 31, 0.24);
          background: rgba(243, 222, 214, 0.72);
          color: var(--secondary);
        }

        .messages-shell {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 1.35rem 1.45rem;
        }

        .messages-stack {
          display: grid;
          gap: 1.1rem;
          align-content: start;
        }

        .assistant-bubble,
        .user-bubble {
          max-width: min(100%, 48rem);
          padding: 1.05rem 1.15rem;
          border-radius: 1.2rem;
          box-shadow: var(--shadow-soft);
        }

        .assistant-bubble {
          background: rgba(255, 253, 251, 0.88);
          border: 1px solid var(--outline-variant);
        }

        .user-bubble {
          margin-left: auto;
          background: var(--secondary);
          color: var(--on-secondary);
        }

        .message-meta {
          margin-top: 0.35rem;
          color: var(--on-surface-variant);
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .assistant-bubble .message-meta {
          color: var(--on-surface-variant);
        }

        .assistant-content,
        .user-content {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
          font-size: 1rem;
          line-height: 1.7;
          font-weight: 300;
        }

        .message-body {
          display: grid;
          gap: 0.7rem;
        }

        .message-paragraph {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .message-list {
          margin: 0;
          padding-left: 1.2rem;
          display: grid;
          gap: 0.35rem;
        }

        .message-list li {
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .source-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .source-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 0.8rem;
          border-radius: 999px;
          border: 1px solid rgba(111, 98, 73, 0.18);
          background: rgba(248, 245, 241, 0.92);
          color: var(--on-surface-variant);
          font-size: 0.72rem;
          line-height: 1;
          font-weight: 600;
        }

        .source-chip a {
          color: inherit;
          text-decoration: none;
        }

        .empty-state {
          display: grid;
          gap: 1rem;
          padding: 2rem;
          border-radius: 1.5rem;
          border: 1px solid var(--outline-variant);
          background: rgba(255, 253, 251, 0.82);
          box-shadow: var(--shadow-soft);
        }

        .empty-state h3 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.75rem;
          line-height: 1;
          font-weight: 300;
        }

        .empty-state p {
          margin: 0;
          color: var(--on-surface-variant);
          line-height: 1.6;
        }

        .recommendations {
          display: grid;
          gap: 0.85rem;
          margin-top: 0.9rem;
        }

        .recommendation-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem;
        }

        .recommendation-card {
          display: grid;
          gap: 0.8rem;
          padding: 0.9rem;
          border-radius: 1.2rem;
          border: 1px solid var(--outline-variant);
          background: rgba(255, 253, 251, 0.92);
          box-shadow: var(--shadow-soft);
        }

        .recommendation-image {
          position: relative;
          aspect-ratio: 16 / 10;
          border-radius: 1rem;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(111, 98, 73, 0.08), rgba(167, 67, 31, 0.08));
        }

        .recommendation-label {
          margin: 0;
          color: var(--secondary);
          font-size: 0.68rem;
          line-height: 1.3;
          letter-spacing: 0.16em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .recommendation-title {
          margin: 0.2rem 0 0;
          font-family: var(--font-display);
          font-size: 1.25rem;
          line-height: 1.1;
          font-weight: 300;
        }

        .recommendation-copy {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 0.86rem;
          line-height: 1.55;
        }

        .recommendation-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          color: var(--on-surface-variant);
          font-size: 0.76rem;
          line-height: 1.3;
        }

        .recommendation-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: fit-content;
          padding: 0.7rem 0.95rem;
          border-radius: 999px;
          border: 1px solid rgba(167, 67, 31, 0.18);
          background: rgba(243, 222, 214, 0.78);
          color: var(--secondary);
          font-size: 0.72rem;
          line-height: 1;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
          transition: transform 150ms ease, background-color 150ms ease;
        }

        .recommendation-action:hover {
          transform: translateY(-1px);
          background: rgba(167, 67, 31, 0.08);
        }

        .recommendation-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
        }

        .recommendation-action.secondary {
          background: rgba(255, 253, 251, 0.92);
          border-color: rgba(111, 98, 73, 0.18);
          color: var(--on-surface-variant);
        }

        .recommendation-action.secondary:hover {
          background: rgba(248, 245, 241, 0.98);
        }

        .composer {
          display: grid;
          gap: 0.8rem;
          padding: 1.1rem 1.4rem 1.35rem;
          border-top: 1px solid var(--outline-variant);
          background: rgba(255, 253, 251, 0.85);
        }

        .composer-row {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 0.7rem;
          align-items: end;
        }

        .composer-input {
          width: 100%;
          min-height: 4rem;
          max-height: 9rem;
          resize: none;
          overflow-y: auto;
          padding: 0.9rem 1rem;
          border-radius: 1rem;
          border: 1px solid var(--outline-variant);
          background: rgba(255, 253, 251, 0.96);
          color: var(--on-surface);
          outline: none;
          box-shadow: var(--shadow-soft);
        }

        .composer-input:focus {
          border-color: rgba(167, 67, 31, 0.24);
        }

        .composer-button,
        .chip-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 2.9rem;
          padding: 0.8rem 1rem;
          border-radius: 999px;
          border: 1px solid rgba(167, 67, 31, 0.18);
          background: var(--secondary);
          color: var(--on-secondary);
          font-size: 0.72rem;
          line-height: 1;
          letter-spacing: 0.16em;
          font-weight: 700;
          text-transform: uppercase;
          transition: transform 150ms ease, background-color 150ms ease, opacity 150ms ease;
        }

        .composer-button:hover,
        .chip-button:hover {
          transform: translateY(-1px);
        }

        .composer-button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
          transform: none;
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }

        .chip-button {
          background: rgba(255, 253, 251, 0.92);
          color: var(--secondary);
        }

        .status-banner {
          padding: 0.9rem 1rem;
          border-radius: 1rem;
          border: 1px solid rgba(167, 67, 31, 0.18);
          background: rgba(243, 222, 214, 0.72);
          color: var(--on-surface);
          font-size: 0.92rem;
          line-height: 1.55;
        }

        .status-banner.error {
          border-color: rgba(186, 26, 26, 0.16);
          background: rgba(255, 218, 214, 0.74);
        }

        .status-banner.neutral {
          background: rgba(248, 245, 241, 0.92);
        }

        .recommendation-shell {
          margin-top: 1rem;
          padding-top: 0.1rem;
        }

        .section-heading {
          margin: 0 0 0.75rem;
          color: var(--secondary);
          font-size: 0.72rem;
          line-height: 1.3;
          letter-spacing: 0.16em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .composer-helper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          color: var(--on-surface-variant);
          font-size: 0.8rem;
          line-height: 1.4;
        }

        .menu-popover {
          position: absolute;
          top: calc(100% + 0.55rem);
          right: 0;
          min-width: 15rem;
          padding: 0.45rem;
          border-radius: 1.1rem;
          border: 1px solid var(--outline-variant);
          background: rgba(255, 253, 251, 0.98);
          box-shadow: var(--shadow-soft);
          z-index: 20;
          display: grid;
          gap: 0.25rem;
        }

        .menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          width: 100%;
          padding: 0.82rem 0.9rem;
          border-radius: 0.9rem;
          color: var(--on-surface);
          font-size: 0.76rem;
          line-height: 1.2;
          letter-spacing: 0.14em;
          font-weight: 700;
          text-transform: uppercase;
          text-align: left;
          transition: background-color 150ms ease, color 150ms ease;
        }

        .menu-item:hover {
          background: rgba(243, 222, 214, 0.82);
          color: var(--secondary);
        }

        .menu-item.destructive {
          color: var(--error);
        }

        .menu-item.destructive:hover {
          background: rgba(255, 218, 214, 0.82);
          color: var(--error);
        }

        .menu-divider {
          height: 1px;
          margin: 0.2rem 0.25rem;
          background: rgba(206, 197, 185, 0.55);
        }

        @media (max-width: 1080px) {
          .concierge-layout {
            grid-template-columns: 1fr;
            gap: 0.9rem;
            height: auto;
            min-height: 0;
            padding: 0.8rem 0 1rem;
          }

          .concierge-rail {
            height: auto;
            min-height: 24rem;
            max-height: none;
          }

          .concierge-main {
            height: min(80dvh, calc(100dvh - 6.5rem));
            max-height: none;
          }

          .recommendation-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .chat-header,
          .composer,
          .concierge-panel-header,
          .concierge-panel-footer,
          .messages-shell {
            padding-left: 1rem;
            padding-right: 1rem;
          }

          .concierge-layout {
            padding-top: 0.75rem;
          }

          .current-chat-card {
            margin: 0.9rem 1rem 0;
          }

          .composer-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <main className="concierge-layout">
        <section className="concierge-main">
          <header className="chat-header">
            <div className="min-w-0">
              <h1 className="truncate">{conversationLabel}</h1>
              <p className="chat-subtitle">
                {isAuthenticated
                  ? "Ask about live listings, itinerary ideas, or operator replies."
                  : "Sign in to continue the conversation and save your chat history."}
              </p>
            </div>

            <div className="chat-actions" ref={chatActionsRef}>
              <button
                className="icon-button"
                type="button"
                aria-label="More options"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                title="More options"
                onClick={() => setMenuOpen((current) => !current)}
              >
                <span className="material-symbols-outlined text-[1.25rem]">more_vert</span>
              </button>

              {menuOpen ? (
                <div className="menu-popover" role="menu" aria-label="Conversation options">
                  <button className="menu-item" type="button" role="menuitem" onClick={() => void performConversationAction("new")}>
                    New chat
                  </button>
                  <button
                    className="menu-item destructive"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (window.confirm("Clear this concierge chat and start a fresh one?")) {
                        void performConversationAction("clear");
                      }
                    }}
                  >
                    Clear chat
                  </button>
                  <div className="menu-divider" />
                  <button className="menu-item" type="button" role="menuitem" onClick={() => void copyLastResponse()}>
                    Copy last response
                  </button>
                  <button className="menu-item" type="button" role="menuitem" onClick={refreshSuggestions}>
                    Refresh suggestions
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <div className="messages-shell">
            <div className="messages-stack">
              {chatMessages.length ? (
                chatMessages.map((message) => (
                  <article
                    key={message.id}
                    className={message.role === "user" ? "user-bubble" : "assistant-bubble"}
                  >
                    <div className={message.role === "user" ? "user-content" : "assistant-content"}>
                      {renderMessageContent(message.content)}
                    </div>

                    {message.sources?.length ? (
                      <div className="source-row">
                        {message.sources.map((source) => (
                          <span key={`${message.id}-${source.id}`} className="source-chip">
                            {source.url ? <Link href={source.url}>{source.title}</Link> : source.title}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {message.created_at ? (
                      <p className="message-meta">{renderRelativeTime(message.created_at)}</p>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <h3>Tell me what kind of trip you&apos;re looking for.</h3>
                  <p>
                    I can suggest real Tour ConnecTT listings, pull in active knowledge sources, and
                    remember the conversation for next time.
                  </p>
                  {!isAuthenticated ? (
                    <Link className="recommendation-action" href="/LoginPage">
                      Sign in to start chatting
                    </Link>
                  ) : null}
                </div>
              )}

              {pending ? (
                <article className="assistant-bubble">
                  <p className="assistant-content">Checking current listings and knowledge sources...</p>
                  <p className="message-meta">Processing</p>
                </article>
              ) : null}

              <div ref={messagesEndRef} />
            </div>

            {showSuggestedListings && suggestedListings.length ? (
              <div className="recommendation-shell">
                <p className="section-heading">Suggested listings</p>
                <div className="recommendation-grid">
                  {suggestedListings.map((listing) => (
                    <article key={listing.id} className="recommendation-card">
                      <div className="recommendation-image">
                        {listing.image_url ? (
                          <Image
                            fill
                            alt={listing.title}
                            className="object-cover"
                            sizes="(max-width: 720px) 100vw, 50vw"
                            src={listing.image_url}
                          />
                        ) : null}
                      </div>
                      <div>
                        <p className="recommendation-label">Recommended match</p>
                        <h3 className="recommendation-title">{listing.title}</h3>
                        <p className="recommendation-copy">{listing.summary}</p>
                        <div className="recommendation-meta">
                          <span>{listing.location}</span>
                          <span>•</span>
                          <span>{listing.duration}</span>
                          <span>•</span>
                          <span>{listing.price ?? "Price on request"}</span>
                        </div>
                        <p className="recommendation-copy" style={{ marginTop: "0.55rem" }}>
                          Operator: {listing.operator_name}
                        </p>
                        <p className="recommendation-copy">{listing.reason}</p>
                      </div>

                      <div className="recommendation-actions">
                        <Link className="recommendation-action" href={listing.href}>
                          Open inquiry
                        </Link>
                        <Link className="recommendation-action secondary" href={`/Messages?listing=${listing.id}`}>
                          Chat with operator
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <footer className="composer">
            {error ? <div className="status-banner error">{error}</div> : null}
            {statusNotice ? <div className="status-banner neutral">{statusNotice}</div> : null}
            {storageNotice ? <div className="status-banner neutral">{storageNotice}</div> : null}
            {!isAuthenticated ? (
              <div className="status-banner neutral">
                Concierge chat requires sign-in to save history and personalize suggestions.
              </div>
            ) : null}
            {!aiConfigured ? (
              <div className="status-banner neutral">
                Concierge AI is unavailable until OpenAI is configured.
              </div>
            ) : null}

            <form className="composer-row" onSubmit={handleSubmit}>
              <button
                className="icon-button"
                aria-label="File attachments unavailable"
                title="File attachments unavailable"
                type="button"
                onClick={handleAttachmentClick}
              >
                <span className="material-symbols-outlined text-[1.25rem]">attach_file</span>
              </button>

              <textarea
                ref={inputRef}
                className="composer-input"
                placeholder={
                  isAuthenticated
                    ? aiConfigured
                      ? "Ask about live listings, trip ideas, or travel help..."
                      : "Concierge AI is unavailable until OpenAI is configured."
                    : "Sign in to send a Concierge AI message."
                }
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={async (event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    await sendMessage(draft);
                  }
                }}
                disabled={!isAuthenticated || !aiConfigured || pending}
                rows={2}
              />

              <button
                className="composer-button"
                type="submit"
                disabled={!isAuthenticated || !aiConfigured || pending || !draft.trim()}
              >
                {pending ? "Sending" : "Send"}
              </button>
            </form>

            <div className="composer-helper">
              <span>Enter sends your message.</span>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
