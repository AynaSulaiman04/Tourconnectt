"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { TravelerProfile } from "@/lib/supabase/profile-types";

type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

type NotificationCenterProps = {
  profileId: string | null;
  role: TravelerProfile["role"] | null;
};

const FALLBACK_POLL_INTERVAL_MS = 120_000;

async function loadPortalPollIntervalMs() {
  try {
    const response = await fetch("/api/portal-settings", { cache: "no-store" });
    if (!response.ok) {
      return FALLBACK_POLL_INTERVAL_MS;
    }

    const payload = (await response.json()) as { notificationPollSeconds?: number };
    const seconds = Number(payload.notificationPollSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return FALLBACK_POLL_INTERVAL_MS;
    }

    return Math.min(Math.max(seconds, 15), 600) * 1000;
  } catch {
    return FALLBACK_POLL_INTERVAL_MS;
  }
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) {
    return "Just now";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;
}

export function NotificationCenter({ profileId, role }: NotificationCenterProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(profileId));
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!profileId) {
      return;
    }

    let active = true;
    let requestInFlight = false;
    let realtimeConnected = false;
    const supabase = createSupabaseBrowserClient();

    async function loadNotifications() {
      if (!active || requestInFlight) {
        return;
      }

      requestInFlight = true;
      setLoading(true);

      try {
        const [{ data, error }, unreadResult] = await Promise.all([
          supabase
            .from("platform_notifications")
            .select("id,title,body,href,read_at,created_at")
            .eq("recipient_profile_id", profileId)
            .order("created_at", { ascending: false })
            .limit(6),
          supabase
            .from("platform_notifications")
            .select("id", { count: "exact", head: true })
            .eq("recipient_profile_id", profileId)
            .is("read_at", null),
        ]);

        if (error) {
          throw error;
        }

        if (!active) {
          return;
        }

        setNotifications((data ?? []) as NotificationRecord[]);
        setUnreadCount(unreadResult.error ? (data ?? []).filter((notification) => !notification.read_at).length : unreadResult.count ?? 0);
      } catch {
        // Keep the last known state. Realtime reconnection or the slow fallback
        // poll can reconcile it without making the menu flash empty.
      } finally {
        requestInFlight = false;
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadNotifications();

    let pollIntervalMs = FALLBACK_POLL_INTERVAL_MS;
    let pollTimer: number | null = null;

    void loadPortalPollIntervalMs().then((nextInterval) => {
      if (!active) {
        return;
      }

      pollIntervalMs = nextInterval;
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === "visible" && !realtimeConnected) {
          void loadNotifications();
        }
      }, pollIntervalMs);
    });

    const channel = supabase
      .channel(`platform_notifications:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "platform_notifications",
          filter: `recipient_profile_id=eq.${profileId}`,
        },
        () => {
          void loadNotifications();
        },
      )
      .subscribe((status) => {
        const wasConnected = realtimeConnected;
        realtimeConnected = status === "SUBSCRIBED";

        if (active && realtimeConnected && !wasConnected) {
          void loadNotifications();
        }
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !realtimeConnected) {
        void loadNotifications();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      if (pollTimer) {
        window.clearInterval(pollTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [profileId]);

  async function markAllRead() {
    if (!profileId) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("platform_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_profile_id", profileId)
      .is("read_at", null);

    if (error) {
      return;
    }

    setUnreadCount(0);
    setNotifications((current) =>
      current.map((notification) =>
        notification.read_at ? notification : { ...notification, read_at: new Date().toISOString() },
      ),
    );
  }

  async function markNotificationRead(notificationId: string) {
    if (!profileId) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("platform_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_profile_id", profileId);

    if (error) {
      return;
    }

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read_at: notification.read_at ?? new Date().toISOString() }
          : notification,
      ),
    );
    setUnreadCount((current) => Math.max(0, current - 1));
  }

  async function handleNotificationClick(notification: NotificationRecord) {
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
    }

    setOpen(false);

    if (notification.href) {
      router.push(notification.href);
    }
  }

  if (!profileId) {
    return null;
  }

  const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="notification-center" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "Open notifications"
        }
        className="btn-icon notification-toggle"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          notifications
        </span>
        {unreadCount > 0 ? <span className="notification-badge">{unreadLabel}</span> : null}
      </button>

      {open ? (
        <div className="notification-menu" role="menu" aria-label="Notifications">
          <div className="notification-menu-head">
            <div>
              <p className="notification-menu-title">Notifications</p>
              <p className="notification-menu-copy">
                {loading && !notifications.length
                  ? "Loading updates..."
                  : unreadCount > 0
                    ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}`
                    : role === "admin"
                      ? "No admin updates right now. Updates will appear when listings, inquiries, users, or bookings change."
                      : role === "operator"
                        ? "No operator updates right now."
                        : "No traveler updates right now."}
              </p>
            </div>

            {unreadCount > 0 ? (
              <button className="notification-menu-action" type="button" onClick={markAllRead}>
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="notification-list">
            {notifications.length ? (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  className={`notification-item ${notification.read_at ? "notification-item-read" : ""}`}
                  type="button"
                  onClick={() => void handleNotificationClick(notification)}
                >
                  <span className="notification-item-mark" aria-hidden="true" />
                  <span className="notification-item-copy">
                    <span className="notification-item-title">{notification.title}</span>
                    <span className="notification-item-body">{notification.body}</span>
                    <span className="notification-item-meta">{formatRelativeTime(notification.created_at)}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className="notification-empty">
                <p>
                  {loading
                    ? "Loading your notifications..."
                    : role === "admin"
                      ? "Admin updates will appear here when listings, inquiries, users, or bookings change."
                      : "You are all caught up."}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
