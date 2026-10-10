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
  island?: string | null;
  price?: string | null;
  price_currency?: string | null;
  price_basis?: string | null;
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
  "island",
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
    fields: [
      "title",
      "location",
      "country",
      "island",
      "duration",
      "summary",
      "category",
      "price",
      "availability",
      "capacity",
    ],
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

const FIELD_LABELS: Partial<Record<keyof OperatorListingDraftLike, string>> = {
  title: "title",
  location: "location",
  country: "country",
  duration: "duration",
  summary: "description",
  category: "category",
  island: "island",
  price: "price",
  availability: "availability",
  capacity: "capacity",
  image_url: "cover image",
  itinerary: "itinerary",
  inclusions: "inclusions",
  exclusions: "exclusions",
  contact_name: "contact name",
  contact_email: "contact email",
};

export function getMissingRequiredFieldLabels(value: OperatorListingDraftLike) {
  return REQUIRED_FIELDS.filter((field) => !isFilled(value[field])).map((field) => FIELD_LABELS[field] ?? String(field));
}

export function calculateListingCompletion(value: OperatorListingDraftLike) {
  const total = REQUIRED_FIELDS.length;
  const completed = REQUIRED_FIELDS.reduce((count, field) => count + (isFilled(value[field]) ? 1 : 0), 0);

  return {
    completed,
    total,
    percentage: total ? Math.round((completed / total) * 100) : 0,
    sections: LISTING_COMPLETION_SECTIONS.map((section) => {
      const requiredInSection = section.fields.filter((field) => REQUIRED_FIELDS.includes(field));
      const completedFields = section.fields.reduce((count, field) => count + (isFilled(value[field]) ? 1 : 0), 0);
      const completedRequired = requiredInSection.reduce((count, field) => count + (isFilled(value[field]) ? 1 : 0), 0);
      return {
        label: section.label,
        completed: completedFields,
        total: section.fields.length,
        isComplete: requiredInSection.length > 0 && completedRequired === requiredInSection.length,
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
