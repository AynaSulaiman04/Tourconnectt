"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type OperatorDashboardLiveRefreshProps = {
  profileId: string | null;
};

export function OperatorDashboardLiveRefresh({ profileId }: OperatorDashboardLiveRefreshProps) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!profileId) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let active = true;

    const scheduleRefresh = () => {
      if (!active) {
        return;
      }

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        if (!active) {
          return;
        }

        router.refresh();
      }, 250);
    };

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
          table: "traveler_operator_messages",
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

    return () => {
      active = false;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [profileId, router]);

  return null;
}
