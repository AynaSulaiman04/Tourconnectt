export type ListingCompletionSection = {
  label: string;
  fields: Array<keyof OperatorListingDraftLike>;
};

export type OperatorListingDraftLike = {
  title?: string | null;
  location?: string | null;
  country?: string | null;
  duration?: string | null;
  summary?: string | null;
  category?: string | null;
  price?: string | null;
  availability?: string | null;
  capacity?: number | string | null;
  itinerary?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  image_url?: string | null;
  image_base64?: string | null;
};

const REQUIRED_FIELDS: Array<keyof OperatorListingDraftLike> = [
  "title",
  "location",
  "country",
  "duration",
  "summary",
  "category",
  "price",
  "availability",
  "capacity",
  "image_url",
  "itinerary",
  "inclusions",
  "exclusions",
  "contact_name",
  "contact_email",
];

export const LISTING_COMPLETION_SECTIONS: ListingCompletionSection[] = [
  {
    label: "Core Narrative",
    fields: ["title", "location", "country", "duration", "summary", "category", "price", "availability", "capacity"],
  },
  {
    label: "Visual Gallery",
    fields: ["image_url"],
  },
  {
    label: "Experience Details",
    fields: ["itinerary", "inclusions", "exclusions", "contact_name", "contact_email", "contact_phone"],
  },
];

function isFilled(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }

  if (typeof value !== "string") {
    return Boolean(value);
  }

  return value.trim().length > 0;
}

export function calculateListingCompletion(value: OperatorListingDraftLike) {
  const total = REQUIRED_FIELDS.length;
  const completed = REQUIRED_FIELDS.reduce((count, field) => count + (isFilled(value[field]) ? 1 : 0), 0);

  return {
    completed,
    total,
    percentage: total ? Math.round((completed / total) * 100) : 0,
    sections: LISTING_COMPLETION_SECTIONS.map((section) => {
      const completedFields = section.fields.reduce((count, field) => count + (isFilled(value[field]) ? 1 : 0), 0);
      return {
        label: section.label,
        completed: completedFields,
        total: section.fields.length,
        isComplete: completedFields === section.fields.length && section.fields.length > 0,
      };
    }),
  };
}

export function normalizeDraftValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
