import "server-only";

export const CONCIERGE_QUOTA_LEDGER_TITLE = "__concierge_quota__";
export const CONCIERGE_QUOTA_MARKER_CONTENT = "__concierge_quota_marker_v1__";

export function getConciergeQuotaLedgerId(profileId: string) {
  // Profile IDs and conversation IDs are both UUIDs. Reusing the owner's UUID
  // gives the hidden ledger an atomic, deterministic primary key without a
  // schema migration or a race-prone title lookup.
  return profileId;
}

export function isConciergeQuotaLedgerId(
  conversationId: string | null | undefined,
  profileId: string,
) {
  return conversationId === getConciergeQuotaLedgerId(profileId);
}

export function isConciergeQuotaLedgerTitle(title: string | null | undefined) {
  return title === CONCIERGE_QUOTA_LEDGER_TITLE;
}
