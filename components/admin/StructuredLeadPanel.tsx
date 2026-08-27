import { parseTripIntent } from "@/lib/ai/trip-intent";
import {
  buildQuoteMailtoHref,
  extractStructuredLeadFromNotes,
  formatStoredLeadSummary,
  getDisplayNotesWithoutLead,
  hasStoredLeadData,
  tripIntentToStoredLead,
  type StoredTripLead,
} from "@/lib/inquiry/structured-lead";

type StructuredLeadPanelProps = {
  notes: string | null | undefined;
  travelerName: string;
  travelerEmail: string;
};

function resolveLead(notes: string | null | undefined): StoredTripLead | null {
  const embedded = extractStructuredLeadFromNotes(notes);
  if (embedded) {
    return embedded;
  }

  const displayNotes = getDisplayNotesWithoutLead(notes);
  if (!displayNotes) {
    return null;
  }

  const parsed = tripIntentToStoredLead(parseTripIntent(displayNotes));
  return hasStoredLeadData(parsed) ? parsed : null;
}

export function StructuredLeadPanel({ notes, travelerName, travelerEmail }: StructuredLeadPanelProps) {
  const lead = resolveLead(notes);
  if (!lead) {
    return null;
  }

  const summaryLines = formatStoredLeadSummary(lead);
  const rawRequest = lead.rawRequest || getDisplayNotesWithoutLead(notes);
  const quoteHref = travelerEmail ? buildQuoteMailtoHref(travelerEmail, travelerName, lead) : null;

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
        <div className="label-caps text-secondary mb-3">Structured enquiry</div>
        <dl className="grid gap-2">
          {summaryLines.map((line) => {
            const separatorIndex = line.indexOf(":");
            const label = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
            const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : "";

            return (
              <div key={line} className="grid gap-1 sm:grid-cols-[minmax(0,9rem)_1fr] sm:gap-3">
                <dt className="font-body-sm text-secondary">{label}</dt>
                <dd className="font-body-md text-on-background">{value}</dd>
              </div>
            );
          })}
        </dl>
      </div>

      {rawRequest ? (
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4">
          <div className="label-caps text-secondary mb-1">Original request</div>
          <p className="font-body-md text-on-background whitespace-pre-wrap">{rawRequest}</p>
        </div>
      ) : null}

      {quoteHref ? (
        <div className="grid gap-2">
          <a className="btn-primary w-full text-center" href={quoteHref}>
            Create quote
          </a>
          <p className="font-body-sm text-secondary">
            Opens your email client with a draft itinerary quote you can adjust before sending.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function getStructuredLeadDescription(notes: string | null | undefined) {
  const lead = resolveLead(notes);
  if (!lead) {
    return getDisplayNotesWithoutLead(notes) || "No notes were provided.";
  }

  const summary = formatStoredLeadSummary(lead);
  return summary.length ? summary.join(" · ") : getDisplayNotesWithoutLead(notes) || "Structured enquiry captured.";
}
