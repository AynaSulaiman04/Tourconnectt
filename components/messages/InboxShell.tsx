"use client";

import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

export type InboxConversationItem = {
  id: string;
  name: string;
  tripTitle: string;
  preview?: string | null;
  time?: string | null;
  unreadCount?: number | null;
  avatarUrl?: string | null;
  active?: boolean;
};

export type InboxActiveConversation = {
  name: string;
  tripTitle: string;
  status?: string | null;
  avatarUrl?: string | null;
  destination?: string | null;
  dates?: string | null;
  guests?: string | null;
  inquiryStatus?: string | null;
};

export type InboxMessageItem = {
  id: string;
  body: string;
  time?: string | null;
  sender: string;
  mine: boolean;
};

export type InboxShellProps = {
  conversations: InboxConversationItem[];
  activeConversation: InboxActiveConversation | null;
  messages: InboxMessageItem[];
  messageValue: string;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void | Promise<void>;
  onSelectConversation: (conversationId: string) => void;
  title: string;
  copy?: string | null;
  sidebarCopy?: string | null;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  sidebarActions?: ReactNode;
  chatActions?: ReactNode;
  contextActions?: ReactNode;
  sidebarEyebrow?: string | null;
  headerBadge?: ReactNode;
  headerActions?: ReactNode;
  chatEyebrow?: string | null;
  composerHint?: string | null;
  composerPlaceholder?: string;
  sendLabel?: string;
  emptyStateTitle?: string;
  emptyStateCopy?: string;
  emptySidebarTitle?: string;
  emptySidebarCopy?: string;
  leftHeaderIcon?: ReactNode;
  composerLeadingAction?: ReactNode;
  composerTrailingAction?: ReactNode;
  shellClassName?: string;
  statusNotice?: ReactNode;
};

function getConversationAvatarLabel(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "TT";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase() : (trimmed.slice(0, 2) || "TT").toUpperCase();
}

export function InboxShell({
  conversations,
  activeConversation,
  messages,
  messageValue,
  onMessageChange,
  onSendMessage,
  onSelectConversation,
  title,
  copy = null,
  sidebarCopy = null,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search conversations...",
  sidebarActions = null,
  chatActions = null,
  contextActions = null,
  sidebarEyebrow = null,
  headerBadge = null,
  headerActions = null,
  chatEyebrow = null,
  composerHint = null,
  composerPlaceholder = "Write a message...",
  sendLabel = "Send Message",
  emptyStateTitle = "Select a conversation to reply.",
  emptyStateCopy = "Choose a conversation from the inbox to continue the thread.",
  emptySidebarTitle = "No conversations yet",
  emptySidebarCopy = "Conversation threads will appear here automatically.",
  leftHeaderIcon = null,
  composerLeadingAction = null,
  composerTrailingAction = null,
  shellClassName = "",
  statusNotice = null,
}: InboxShellProps) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const contextItems = [
    activeConversation?.destination ? { label: "Destination", value: activeConversation.destination } : null,
    activeConversation?.dates ? { label: "Dates", value: activeConversation.dates } : null,
    activeConversation?.guests ? { label: "Guests", value: activeConversation.guests } : null,
    activeConversation?.inquiryStatus ? { label: "Status", value: activeConversation.inquiryStatus } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }

    thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }, [messages, activeConversation?.name]);

  return (
    <main className="tc-inbox-page">
      <section className={`tc-inbox-shell ${shellClassName}`.trim()}>
        <aside className="tc-inbox-sidebar">
          <header className="tc-panel-head">
            <div className="tc-panel-head-copy">
              <div className="tc-panel-head-row">
                <div>
                  {sidebarEyebrow ? <p className="tc-eyebrow">{sidebarEyebrow}</p> : null}
                  <h1 className="tc-sidebar-title">{title}</h1>
                </div>
                {leftHeaderIcon ? <div className="tc-panel-head-icon">{leftHeaderIcon}</div> : null}
              </div>
              {sidebarCopy || copy ? <p className="tc-panel-copy">{sidebarCopy ?? copy}</p> : null}
            </div>
            {sidebarActions ? <div className="tc-sidebar-actions">{sidebarActions}</div> : null}
          </header>

          {onSearchChange ? (
            <div className="tc-search-wrap">
              <span className="material-symbols-outlined tc-search-icon" aria-hidden="true">
                search
              </span>
              <input
                aria-label="Search conversations"
                className="tc-search-input"
                onChange={(event) => onSearchChange(event.currentTarget.value)}
                placeholder={searchPlaceholder}
                value={searchValue}
              />
            </div>
          ) : null}

          <div className="tc-conversation-list">
            {conversations.length ? (
              conversations.map((conversation) => {
                const active = Boolean(conversation.active);
                return (
                  <button
                    key={conversation.id}
                    className={`tc-conversation-item ${active ? "is-active" : ""}`}
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                  >
                    <span className="tc-conversation-avatar" aria-hidden="true">
                      {conversation.avatarUrl ? (
                        <Image alt="" fill className="tc-conversation-avatar-image" sizes="48px" src={conversation.avatarUrl} />
                      ) : (
                        <span>{getConversationAvatarLabel(conversation.name)}</span>
                      )}
                    </span>

                    <span className="tc-conversation-body">
                      <span className="tc-conversation-top">
                        <span>
                          <span className="tc-conversation-name">{conversation.name}</span>
                          <span className="tc-conversation-trip">{conversation.tripTitle}</span>
                        </span>
                        {typeof conversation.time === "string" && conversation.time.length > 0 ? (
                          <span className="tc-conversation-time">{conversation.time}</span>
                        ) : null}
                      </span>
                      <span className="tc-conversation-preview">{conversation.preview || "No messages yet."}</span>
                      {conversation.unreadCount && conversation.unreadCount > 0 ? (
                        <span className="tc-conversation-unread">{conversation.unreadCount}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="tc-empty-state">
                <strong>{emptySidebarTitle}</strong>
                <p>{emptySidebarCopy}</p>
              </div>
            )}
          </div>
        </aside>

        <section className="tc-chat-panel">
          <header className="tc-chat-header">
            <div className="tc-chat-header-copy">
              {chatEyebrow ? <p className="tc-eyebrow">{chatEyebrow}</p> : null}
              <div className="tc-chat-header-main">
                <span className="tc-chat-avatar" aria-hidden="true">
                  {activeConversation?.avatarUrl ? (
                    <Image alt="" fill className="tc-chat-avatar-image" sizes="64px" src={activeConversation.avatarUrl} />
                  ) : (
                    <span>{getConversationAvatarLabel(activeConversation?.name ?? "Tour ConnecTT")}</span>
                  )}
                </span>
                <div className="tc-chat-header-copy-block">
                  <div className="tc-chat-title-row">
                    <h2 className="tc-chat-title">{activeConversation?.name ?? "Select a conversation"}</h2>
                    {headerBadge ? <div className="tc-chat-header-badge">{headerBadge}</div> : null}
                  </div>
                  <p className="tc-chat-copy">{activeConversation?.tripTitle ?? emptyStateTitle}</p>
                </div>
              </div>
            </div>

            <div className="tc-chat-header-actions">
              {chatActions ? <div className="tc-chat-actions">{chatActions}</div> : null}
              {headerActions ? <div className="tc-chat-header-icons">{headerActions}</div> : null}
            </div>
          </header>

          {contextItems.length ? (
            <div className="tc-chat-context-strip">
              {contextItems.map((item) => (
                <div key={item.label} className="tc-chat-context-item">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {contextActions ? <div className="tc-chat-context-actions">{contextActions}</div> : null}

          {statusNotice ? <div className="tc-chat-status">{statusNotice}</div> : null}

          <div className="tc-message-thread" ref={threadRef}>
            {messages.length ? (
              messages.map((message) => (
                <article key={message.id} className={`tc-message-row ${message.mine ? "is-mine" : "is-theirs"}`}>
                  {!message.mine ? (
                    <span className="tc-message-avatar" aria-hidden="true">
                      {message.sender.slice(0, 1)}
                    </span>
                  ) : null}
                  <div className="tc-message-bubble">
                    <p>{message.body}</p>
                    {message.time ? <span className="tc-message-time">{message.sender} {" · "} {message.time}</span> : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="tc-empty-thread">
                <strong>{emptyStateTitle}</strong>
                <p>{emptyStateCopy}</p>
              </div>
            )}
          </div>

          <form
            className="tc-message-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void onSendMessage();
            }}
          >
            <div className="tc-message-composer-row tc-message-composer-row-input">
              {composerLeadingAction ? <div className="tc-composer-icon-slot">{composerLeadingAction}</div> : null}
              <textarea
                className="tc-message-input"
                onChange={(event) => onMessageChange(event.currentTarget.value)}
                placeholder={composerPlaceholder}
                value={messageValue}
                rows={3}
              />
              {composerTrailingAction ? <div className="tc-composer-icon-slot">{composerTrailingAction}</div> : null}
            </div>

            <div className="tc-message-composer-row">
              <div className="tc-composer-note">
                {composerHint ? (
                  <>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      lock
                    </span>
                    <span>{composerHint}</span>
                  </>
                ) : (
                  <span />
                )}
              </div>
              <button className="tc-message-send" type="submit" disabled={!messageValue.trim()}>
                {sendLabel}
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
