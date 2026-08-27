import { parseTripIntent, parseTripIntentFromConversation } from "../lib/ai/trip-intent.ts";
import {
  embedStructuredLeadInNotes,
  extractStructuredLeadFromNotes,
  formatStoredLeadSummary,
  hasStoredLeadData,
  tripIntentToStoredLead,
} from "../lib/inquiry/structured-lead.ts";

const EXAMPLE =
  "We're four adults coming from Toronto for six days. We'd love to visit Pitch Lake, Maracas Beach, Caroni Bird Sanctuary, eat doubles at a famous place, spend one night in Tobago, and stay in a boutique hotel.";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const intent = parseTripIntent(EXAMPLE);
  assert(intent.travellerCount === 4, `Expected 4 travellers, got ${intent.travellerCount}`);
  assert(intent.durationDays === 6, `Expected 6 days, got ${intent.durationDays}`);
  assert(intent.origin === "Toronto", `Expected Toronto origin, got ${intent.origin}`);
  assert(intent.attractions.includes("Pitch Lake"), "Missing Pitch Lake");
  assert(intent.attractions.includes("Maracas Beach"), "Missing Maracas Beach");
  assert(intent.attractions.includes("Caroni Bird Sanctuary"), "Missing Caroni Bird Sanctuary");
  assert(intent.accommodation.includes("Boutique hotel"), "Missing boutique hotel");
  assert(
    intent.itineraryNotes.some((note) => note.includes("Tobago")),
    `Missing Tobago note: ${intent.itineraryNotes.join(", ")}`,
  );

  const conversationIntent = parseTripIntentFromConversation([
    { role: "user", content: "We want beaches and local food in Trinidad." },
    { role: "assistant", content: "Great choice." },
    { role: "user", content: "Four adults from Toronto for six days." },
  ]);
  assert(conversationIntent.travellerCount === 4, "Conversation merge failed for travellers");
  assert(conversationIntent.origin === "Toronto", "Conversation merge failed for origin");
  assert(conversationIntent.durationDays === 6, "Conversation merge failed for duration");

  const lead = tripIntentToStoredLead(intent);
  assert(hasStoredLeadData(lead), "Lead should contain structured data");
  const notes = embedStructuredLeadInNotes(lead, EXAMPLE);
  const parsed = extractStructuredLeadFromNotes(notes);
  assert(parsed?.travelers === 4, "Round-trip lead travellers failed");
  assert(parsed?.origin === "Toronto", "Round-trip lead origin failed");

  const summary = formatStoredLeadSummary(lead);
  assert(summary.some((line) => line.startsWith("Travellers: 4")), "Summary missing travellers");
  assert(summary.some((line) => line.startsWith("Origin: Toronto")), "Summary missing origin");
  assert(summary.some((line) => line.startsWith("Duration: 6 days")), "Summary missing duration");
  assert(
    summary.some((line) => line.includes("Boutique hotel")),
    "Summary missing accommodation",
  );

  console.log("QA lead capture: all checks passed");
  console.log(summary.join("\n"));
}

run();
