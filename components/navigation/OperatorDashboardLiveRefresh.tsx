"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type OperatorDashboardLiveRefreshProps = {
  profileId: string | null;
};

const REFRESH_DEBOUNCE_MS = 750;
const MIN_REFRESH_INTERVAL_MS = 10_000;

export function OperatorDashboardLiveRefresh({ profileId }: OperatorDashboardLiveRefreshProps) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!profileId) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let active = true;
    let dirty = false;
    let lastRefreshAt = 0;

    const scheduleRefresh = () => {
      if (!active) {
        return;
      }

      dirty = true;

      if (document.visibilityState !== "visible" || refreshTimerRef.current !== null) {
        return;
      }

      const elapsedSinceRefresh = Date.now() - lastRefreshAt;
      const delay = Math.max(REFRESH_DEBOUNCE_MS, MIN_REFRESH_INTERVAL_MS - elapsedSinceRefresh);

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;

        if (!active || !dirty || document.visibilityState !== "visible") {
          return;
        }

        dirty = false;
        lastRefreshAt = Date.now();
        router.refresh();
      }, delay);
    };

    // Message rows do not include an operator id, so subscribing to that table
    // would refresh every operator's dashboard for every platform message.
    // Scoped conversation and notification changes provide safe refresh signals.
    const channel = supabase
      .channel(`operator-dashboard:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tour_listings",
          filter: `operator_id=eq.${profileId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operator_listing_drafts",
          filter: `operator_id=eq.${profileId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inquiries",
          filter: `operator_id=eq.${profileId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "traveler_operator_conversations",
          filter: `operator_id=eq.${profileId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "platform_notifications",
          filter: `recipient_profile_id=eq.${profileId}`,
        },
        scheduleRefresh,
      )
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && dirty) {
        scheduleRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [profileId, router]);

  return null;
}
