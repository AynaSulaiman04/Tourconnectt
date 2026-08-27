export type TripIntent = {
  rawQuery: string;
  destinations: string[];
  durationDays: number | null;
  travellerCount: number | null;
  travellerDescription: string | null;
  origin: string | null;
  interests: string[];
  attractions: string[];
  accommodation: string[];
  flights: string[];
  transportation: string[];
  scheduleNotes: string[];
  budget: string | null;
  itineraryNotes: string[];
};

const WORD_NUMBER_MAP: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const DESTINATION_TERMS = [
  "trinidad",
  "tobago",
  "port of spain",
  "scarborough",
  "caribbean",
  "maracas",
  "pigeon point",
];

const INTEREST_GROUPS: Array<{ label: string; terms: string[] }> = [
  { label: "beaches", terms: ["beach", "beaches", "coast", "coastal", "island", "reef", "snorkel", "swim", "sea"] },
  { label: "local food", terms: ["food", "culinary", "dining", "restaurant", "local food", "street food", "cuisine"] },
  { label: "nature", terms: ["nature", "hike", "hiking", "waterfall", "wildlife", "trail", "outdoor", "rainforest"] },
  { label: "culture", terms: ["culture", "heritage", "history", "museum", "music", "festival"] },
  { label: "family travel", terms: ["family", "kids", "children", "child"] },
  { label: "romantic travel", terms: ["romantic", "couple", "honeymoon", "anniversary"] },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDurationDays(query: string) {
  const normalized = normalize(query);
  const dayMatch = normalized.match(/\b(?:for\s+)?(\d+)\s*(?:day|days)\b/);
  if (dayMatch) {
    return Number(dayMatch[1]);
  }

  const wordDayMatch = normalized.match(
    /\b(?:for\s+)?(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:day|days)\b/,
  );
  if (wordDayMatch) {
    return WORD_NUMBER_MAP[wordDayMatch[1]] ?? null;
  }

  if (/\bweekend\b/.test(normalized)) {
    return 2;
  }

  if (/\b(?:a|one|1)\s+week\b/.test(normalized) || /\b7\s*days?\b/.test(normalized)) {
    return 7;
  }

  return null;
}

function parseTravellerCount(query: string) {
  const normalized = normalize(query);

  const familyOfMatch = normalized.match(/\bfamily of (\d+)\b/);
  if (familyOfMatch) {
    return Number(familyOfMatch[1]);
  }

  const adultsWordMatch = normalized.match(
    /\b(?:we(?:'re| are)|were)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+adults?\b/,
  );
  if (adultsWordMatch) {
    return WORD_NUMBER_MAP[adultsWordMatch[1]] ?? null;
  }

  const standaloneAdultsMatch = normalized.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+adults?\b/,
  );
  if (standaloneAdultsMatch) {
    return WORD_NUMBER_MAP[standaloneAdultsMatch[1]] ?? null;
  }

  const adultsNumberMatch = normalized.match(/\b(\d+)\s+adults?\b/);
  if (adultsNumberMatch) {
    return Number(adultsNumberMatch[1]);
  }

  const guestsMatch = normalized.match(/\b(\d+)\s+(?:guests|travellers|travelers|people)\b/);
  if (guestsMatch) {
    return Number(guestsMatch[1]);
  }

  if (/\b(?:solo|alone|just me|by myself)\b/.test(normalized)) {
    return 1;
  }

  if (/\bcouple\b/.test(normalized) || /\bwith my (?:wife|husband|partner)\b/.test(normalized)) {
    let count = 2;
    if (/\b(?:two|2)\s+children\b/.test(normalized)) {
      count += 2;
    } else if (/\bchildren\b/.test(normalized)) {
      count += 1;
    }
    return count;
  }

  if (/\bwith my wife and two children\b/.test(normalized)) {
    return 4;
  }

  if (/\bfamily\b/.test(normalized)) {
    return 4;
  }

  return null;
}

function parseTravellerDescription(query: string) {
  const normalized = normalize(query);
  if (/\bwith my wife and two children\b/.test(normalized)) {
    return "family of four";
  }
  if (/\bcouple\b/.test(normalized)) {
    return "couple";
  }
  if (/\bfamily\b/.test(normalized)) {
    return "family";
  }
  if (/\bsolo\b/.test(normalized) || /\balone\b/.test(normalized)) {
    return "solo traveller";
  }
  return null;
}

function parseDestinations(query: string) {
  const normalized = normalize(query);
  const destinations = DESTINATION_TERMS.filter((term) => normalized.includes(term));
  return [...new Set(destinations.map((term) => term.replace(/\b\w/g, (char) => char.toUpperCase())))];
}

function parseOrigin(query: string) {
  const normalized = normalize(query);
  const patterns = [
    /\b(?:coming from|flying from|arriving from|traveling from|travelling from)\s+([a-z][a-z\s'-]{2,40}?)(?:\s+for|\s+and|,|\.|$)/,
    /\b(?:we(?:'re| are)|were)\s+(?:four|five|six|\d+)\s+adults?\s+coming from\s+([a-z][a-z\s'-]{2,40}?)(?:\s+for|\s+and|,|\.|$)/,
    /\bfrom\s+([a-z][a-z\s'-]{2,40}?)\s+for\s+(?:\d+|one|two|three|four|five|six)\s+(?:day|days)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const origin = match[1].trim();
      if (origin.length >= 3 && !DESTINATION_TERMS.includes(origin)) {
        return origin.replace(/\b\w/g, (char) => char.toUpperCase());
      }
    }
  }

  return null;
}

function parseInterests(query: string) {
  const normalized = normalize(query);
  return INTEREST_GROUPS.filter((group) => group.terms.some((term) => normalized.includes(term))).map(
    (group) => group.label,
  );
}

function parseBudget(query: string) {
  const normalized = normalize(query);
  if (/\b(?:luxury|premium|high end|high-end)\b/.test(normalized)) {
    return "premium";
  }
  if (/\b(?:budget|affordable|cheap|value)\b/.test(normalized)) {
    return "value-focused";
  }
  const amountMatch = normalized.match(/\b(?:under|below|around|about)\s+\$?\s*(\d[\d,]*)\b/);
  if (amountMatch) {
    return `around ${amountMatch[1]}`;
  }
  return null;
}

function parseAttractions(query: string) {
  const normalized = normalize(query);
  const attractions: string[] = [];

  const named = [
    { label: "Pitch Lake", terms: ["pitch lake"] },
    { label: "Maracas Beach", terms: ["maracas beach", "maracas bay", "maracas"] },
    { label: "Pigeon Point", terms: ["pigeon point"] },
    { label: "Nylon Pool", terms: ["nylon pool"] },
    { label: "Caroni Bird Sanctuary", terms: ["caroni bird sanctuary", "caroni"] },
    { label: "Asa Wright", terms: ["asa wright"] },
    { label: "Fort George", terms: ["fort george"] },
    { label: "Doubles (local street food)", terms: ["doubles", "eat doubles"] },
  ];

  for (const entry of named) {
    if (entry.terms.some((term) => normalized.includes(term))) {
      attractions.push(entry.label);
    }
  }

  if (/\b(?:attraction|sightseeing|museum|waterfall|market)\b/.test(normalized)) {
    attractions.push("Sightseeing and local attractions");
  }

  return attractions;
}

function parseAccommodation(query: string) {
  const normalized = normalize(query);
  const notes: string[] = [];

  if (/\bboutique hotel\b/.test(normalized) || /\bboutique stay\b/.test(normalized)) {
    notes.push("Boutique hotel");
  }
  if (/\b(?:hotel|resort|stay|accommodation|guesthouse|bnb|lodge|villa)\b/.test(normalized)) {
    notes.push("Hotel or resort stay");
  }
  if (/\b(?:beachfront|ocean view|sea view)\b/.test(normalized)) {
    notes.push("Beachfront or sea-view stay");
  }

  return uniqueList(notes);
}

function parseFlights(query: string) {
  const normalized = normalize(query);
  const notes: string[] = [];

  if (/\b(?:flight|flights|fly|flying|airport|airline)\b/.test(normalized)) {
    notes.push("Flights or airport transfers");
  }
  if (/\bpiarco\b/.test(normalized)) {
    notes.push("Piarco International Airport");
  }

  return notes;
}

function parseTransportation(query: string) {
  const normalized = normalize(query);
  const notes: string[] = [];

  if (/\b(?:car rental|rent a car|self drive|drive ourselves)\b/.test(normalized)) {
    notes.push("Car rental");
  }
  if (/\b(?:ferry|boat|water taxi)\b/.test(normalized)) {
    notes.push("Boat or ferry");
  }
  if (/\b(?:taxi|transfer|shuttle|transport|private driver)\b/.test(normalized)) {
    notes.push("Transfers or local transport");
  }

  return notes;
}

function parseScheduleNotes(query: string) {
  const normalized = normalize(query);
  const notes: string[] = [];

  if (/\b(?:morning|afternoon|evening|sunset|sunrise)\b/.test(normalized)) {
    notes.push("Time-of-day preferences mentioned");
  }
  if (/\b(?:early start|late checkout|flexible timing)\b/.test(normalized)) {
    notes.push("Flexible schedule preferences");
  }
  if (/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(normalized)) {
    notes.push("Specific times mentioned");
  }

  return notes;
}

function uniqueList(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function mergeTripIntents(base: TripIntent, next: TripIntent): TripIntent {
  return {
    rawQuery: next.rawQuery || base.rawQuery,
    destinations: uniqueList([...base.destinations, ...next.destinations]),
    durationDays: next.durationDays ?? base.durationDays,
    travellerCount: next.travellerCount ?? base.travellerCount,
    travellerDescription: next.travellerDescription ?? base.travellerDescription,
    origin: next.origin ?? base.origin,
    interests: uniqueList([...base.interests, ...next.interests]),
    attractions: uniqueList([...base.attractions, ...next.attractions]),
    accommodation: uniqueList([...base.accommodation, ...next.accommodation]),
    flights: uniqueList([...base.flights, ...next.flights]),
    transportation: uniqueList([...base.transportation, ...next.transportation]),
    scheduleNotes: uniqueList([...base.scheduleNotes, ...next.scheduleNotes]),
    budget: next.budget ?? base.budget,
    itineraryNotes: uniqueList([...base.itineraryNotes, ...next.itineraryNotes]),
  };
}

export function parseTripIntentFromConversation(
  messages: Array<{ role: string; content: string }>,
): TripIntent {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n");

  if (!userText) {
    return parseTripIntent("");
  }

  const segments = userText.split("\n").filter(Boolean);
  let merged = parseTripIntent(segments[0] ?? userText);

  for (const segment of segments.slice(1)) {
    merged = mergeTripIntents(merged, parseTripIntent(segment));
  }

  merged.rawQuery = userText;
  return merged;
}

function parseItineraryNotes(query: string) {
  const normalized = normalize(query);
  const notes: string[] = [];

  if (/\b(?:spend|stay|one|1|a)\s+night\s+in\s+tobago\b/.test(normalized)) {
    notes.push("Spend one night in Tobago");
  } else if (/\bday trip to tobago\b/.test(normalized)) {
    notes.push("Include a day trip to Tobago");
  } else if (/\bday trip\b/.test(normalized)) {
    notes.push("Include a day trip");
  }
  if (/\bslow pace\b/.test(normalized) || /\brelaxed\b/.test(normalized)) {
    notes.push("Prefer a relaxed pace");
  }

  return notes;
}

export function parseTripIntent(query: string): TripIntent {
  const trimmed = query.trim();

  return {
    rawQuery: trimmed,
    destinations: parseDestinations(trimmed),
    durationDays: parseDurationDays(trimmed),
    travellerCount: parseTravellerCount(trimmed),
    travellerDescription: parseTravellerDescription(trimmed),
    origin: parseOrigin(trimmed),
    interests: parseInterests(trimmed),
    attractions: parseAttractions(trimmed),
    accommodation: parseAccommodation(trimmed),
    flights: parseFlights(trimmed),
    transportation: parseTransportation(trimmed),
    scheduleNotes: parseScheduleNotes(trimmed),
    budget: parseBudget(trimmed),
    itineraryNotes: parseItineraryNotes(trimmed),
  };
}

export function expandQueryWithTripIntent(query: string, intent: TripIntent) {
  return [
    query,
    ...intent.destinations,
    intent.origin ?? "",
    ...intent.interests,
    ...intent.attractions,
    ...intent.accommodation,
    ...intent.flights,
    ...intent.transportation,
    ...intent.scheduleNotes,
    intent.budget ?? "",
    ...intent.itineraryNotes,
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatTripIntentSummary(intent: TripIntent) {
  if (!intent.rawQuery.trim()) {
    return null;
  }

  const lines = [
    intent.destinations.length ? `Destination: ${intent.destinations.join(", ")}` : null,
    intent.durationDays ? `Duration: ${intent.durationDays} days` : null,
    intent.travellerCount
      ? `Travellers: ${intent.travellerCount}${intent.travellerDescription ? ` (${intent.travellerDescription})` : ""}`
      : intent.travellerDescription
        ? `Travellers: ${intent.travellerDescription}`
        : null,
    intent.origin ? `Origin: ${intent.origin}` : null,
    intent.flights.length ? `Flights: ${intent.flights.join(", ")}` : null,
    intent.accommodation.length ? `Stay: ${intent.accommodation.join(", ")}` : null,
    intent.transportation.length ? `Transport: ${intent.transportation.join(", ")}` : null,
    intent.attractions.length ? `Attractions: ${intent.attractions.join(", ")}` : null,
    intent.interests.length ? `Interests: ${intent.interests.join(", ")}` : null,
    intent.scheduleNotes.length ? `Schedule: ${intent.scheduleNotes.join(", ")}` : null,
    intent.budget ? `Budget: ${intent.budget}` : null,
    intent.itineraryNotes.length ? `Itinerary notes: ${intent.itineraryNotes.join("; ")}` : null,
  ].filter(Boolean);

  return lines.length ? lines.join(" · ") : null;
}

export function formatTripIntentPromptBlock(intent: TripIntent) {
  if (!intent.rawQuery.trim()) {
    return null;
  }

  return [
    "Parsed trip request:",
    intent.destinations.length ? `- Destination: ${intent.destinations.join(", ")}` : null,
    intent.durationDays ? `- Duration: ${intent.durationDays} days` : null,
    intent.travellerCount
      ? `- Travellers: ${intent.travellerCount}${intent.travellerDescription ? ` (${intent.travellerDescription})` : ""}`
      : intent.travellerDescription
        ? `- Travellers: ${intent.travellerDescription}`
        : null,
    intent.origin ? `- Origin: ${intent.origin}` : null,
    intent.flights.length ? `- Flights: ${intent.flights.join(", ")}` : null,
    intent.accommodation.length ? `- Accommodation: ${intent.accommodation.join(", ")}` : null,
    intent.transportation.length ? `- Transportation: ${intent.transportation.join(", ")}` : null,
    intent.attractions.length ? `- Attractions: ${intent.attractions.join(", ")}` : null,
    intent.interests.length ? `- Interests: ${intent.interests.join(", ")}` : null,
    intent.scheduleNotes.length ? `- Schedule preferences: ${intent.scheduleNotes.join(", ")}` : null,
    intent.budget ? `- Budget: ${intent.budget}` : null,
    intent.itineraryNotes.length ? `- Itinerary preferences: ${intent.itineraryNotes.join("; ")}` : null,
    "- Build a draft day-by-day itinerary outline the traveller can refine through chat.",
    "- Include flights, accommodation, attractions, transportation, and daily timing where relevant.",
  ]
    .filter(Boolean)
    .join("\n");
}
