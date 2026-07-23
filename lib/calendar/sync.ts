import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { pullGoogleCalendarChanges } from "./google";

export type GoogleCalendarSyncSummary = {
  ok: boolean;
  operatorsChecked: number;
  eventsPulled: number;
  conflictsFound: number;
  updated: number;
  errors: string[];
  skipped?: boolean;
};

export async function processGoogleCalendarSync(): Promise<GoogleCalendarSyncSummary> {
  const admin = createSupabaseServiceRoleClient();
  const { data: integrations, error } = await admin
    .from("operator_calendar_integrations")
    .select("operator_id,provider")
    .eq("provider", "google");

  if (error) {
    throw new Error(error.message);
  }

  const operatorIds = [...new Set((integrations ?? []).map((item) => item.operator_id).filter(Boolean))] as string[];

  const summary: GoogleCalendarSyncSummary = {
    ok: true,
    operatorsChecked: 0,
    eventsPulled: 0,
    conflictsFound: 0,
    updated: 0,
    errors: [],
  };

  for (const operatorId of operatorIds) {
    try {
      const result = await pullGoogleCalendarChanges(operatorId);
      summary.operatorsChecked += 1;

      if (result.ok) {
        summary.eventsPulled += result.eventsPulled ?? 0;
        summary.conflictsFound += result.conflictsFound ?? 0;
        summary.updated += result.updated ?? 0;
      } else {
        summary.ok = false;
        summary.errors.push(result.error ?? "Unable to process Google Calendar changes.");
      }
    } catch (error) {
      summary.ok = false;
      summary.errors.push(error instanceof Error ? error.message : "Unable to process Google Calendar changes.");
    }
  }

  return summary;
}
