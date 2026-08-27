import type { TripIntent } from "@/lib/ai/trip-intent";

const LEAD_START = "---TT_CONNECT_LEAD_JSON---";
const LEAD_END = "---END_TT_CONNECT_LEAD---";

export type StoredTripLead = {
  travelers: number | null;
  travellerDescription: string | null;
  durationDays: number | null;
  origin: string | null;
  destinations: string[];
  interests: string[];
  attractions: string[];
  accommodation: string[];
  transportation: string[];
  flights: string[];
  scheduleNotes: string[];
  budget: string | null;
  itineraryNotes: string[];
  rawRequest: string;
};

export function tripIntentToStoredLead(intent: TripIntent): StoredTripLead {
  return {
    travelers: intent.travellerCount,
    travellerDescription: intent.travellerDescription,
    durationDays: intent.durationDays,
    origin: intent.origin,
    destinations: intent.destinations,
    interests: intent.interests,
    attractions: intent.attractions,
    accommodation: intent.accommodation,
    transportation: intent.transportation,
    flights: intent.flights,
    scheduleNotes: intent.scheduleNotes,
    budget: intent.budget,
    itineraryNotes: intent.itineraryNotes,
    rawRequest: intent.rawQuery,
  };
}

export function hasStoredLeadData(lead: StoredTripLead) {
  return Boolean(
    lead.travelers ||
      lead.travellerDescription ||
      lead.durationDays ||
      lead.origin ||
      lead.destinations.length ||
      lead.interests.length ||
      lead.attractions.length ||
      lead.accommodation.length ||
      lead.transportation.length ||
      lead.flights.length ||
      lead.scheduleNotes.length ||
      lead.budget ||
      lead.itineraryNotes.length,
  );
}

export function embedStructuredLeadInNotes(lead: StoredTripLead, displayNotes = "") {
  const payload = JSON.stringify(lead);
  const trimmedDisplay = displayNotes.trim();

  if (!trimmedDisplay) {
    return `${LEAD_START}\n${payload}\n${LEAD_END}`;
  }

  return `${LEAD_START}\n${payload}\n${LEAD_END}\n\n${trimmedDisplay}`;
}

export function extractStructuredLeadFromNotes(notes: string | null | undefined): StoredTripLead | null {
  if (!notes?.includes(LEAD_START)) {
    return null;
  }

  const start = notes.indexOf(LEAD_START) + LEAD_START.length;
  const end = notes.indexOf(LEAD_END, start);
  if (end < 0) {
    return null;
  }

  try {
    return JSON.parse(notes.slice(start, end).trim()) as StoredTripLead;
  } catch {
    return null;
  }
}

export function getDisplayNotesWithoutLead(notes: string | null | undefined) {
  if (!notes) {
    return "";
  }

  if (!notes.includes(LEAD_START)) {
    return notes.trim();
  }

  const end = notes.indexOf(LEAD_END);
  if (end < 0) {
    return notes.trim();
  }

  return notes.slice(end + LEAD_END.length).trim();
}

export function formatStoredLeadSummary(lead: StoredTripLead) {
  const travellerLabel =
    lead.travelers
      ? `Travellers: ${lead.travelers}`
      : lead.travellerDescription
        ? `Travellers: ${lead.travellerDescription}`
        : null;

  const interestLabels = [...lead.interests, ...lead.attractions];

  return [
    travellerLabel,
    lead.durationDays ? `Duration: ${lead.durationDays} days` : null,
    lead.origin ? `Origin: ${lead.origin}` : null,
    lead.destinations.length ? `Destination: ${lead.destinations.join(", ")}` : null,
    interestLabels.length ? `Interests: ${interestLabels.join(", ")}` : null,
    lead.accommodation.length ? `Accommodation preference: ${lead.accommodation.join(", ")}` : null,
    lead.transportation.length ? `Transport: ${lead.transportation.join(", ")}` : null,
    lead.flights.length ? `Flights: ${lead.flights.join(", ")}` : null,
    lead.scheduleNotes.length ? `Schedule: ${lead.scheduleNotes.join(", ")}` : null,
    lead.budget ? `Budget: ${lead.budget}` : null,
    lead.itineraryNotes.length ? `Itinerary notes: ${lead.itineraryNotes.join("; ")}` : null,
  ].filter((line): line is string => Boolean(line));
}

export function buildQuoteEmailDraft(lead: StoredTripLead, travelerName: string) {
  const summary = formatStoredLeadSummary(lead);
  const greeting = travelerName ? `Hi ${travelerName},` : "Hi there,";
  const dayCount = lead.durationDays ? Math.min(lead.durationDays, 7) : 1;

  return [
    greeting,
    "",
    "Thank you for your enquiry with Tour ConnecTT. Based on your request, here is a draft quote we can refine together:",
    "",
    ...summary.map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex < 0) {
        return `- ${line}`;
      }

      return `- ${line.slice(0, separatorIndex)}: ${line.slice(separatorIndex + 1).trim()}`;
    }),
    "",
    "Suggested itinerary:",
    ...Array.from({ length: dayCount }, (_, index) => `Day ${index + 1}: [Add experience and timing]`),
    "",
    "Please let us know if you would like us to adjust hotels, transport, or activities before we finalise your booking.",
    "",
    "Warm regards,",
    "Tour ConnecTT Travel Consultant",
  ].join("\n");
}

export function buildQuoteMailtoHref(email: string, travelerName: string, lead: StoredTripLead) {
  const subject = encodeURIComponent("Your Tour ConnecTT travel quote");
  const body = encodeURIComponent(buildQuoteEmailDraft(lead, travelerName));
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}
