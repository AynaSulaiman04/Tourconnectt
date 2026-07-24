import "server-only";

import { OAuth2Client } from "google-auth-library";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type InquiryRow = {
  id: string;
  user_id: string | null;
  listing_id: string | null;
  traveler_name: string;
  traveler_email: string;
  traveler_phone: string | null;
  destination: string;
  destination_country: string;
  operator_name: string;
  operator_id: string | null;
  preferred_start_date: string | null;
  preferred_end_date: string | null;
  availability: "morning" | "afternoon" | "evening" | "flexible";
  notes: string | null;
  status: "submitted" | "reviewed" | "confirmed" | "closed";
  google_calendar_event_id: string | null;
  google_calendar_synced_at: string | null;
  ical_uid: string | null;
  calendar_sync_status: string | null;
  calendar_conflict_status: string | null;
  calendar_last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

type ListingRow = {
  id: string;
  title: string;
  location: string;
  operator_id: string | null;
  operator_name: string;
  duration?: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "traveler" | "operator" | "admin";
};

export type OperatorCalendarIntegration = {
  id: string;
  operator_id: string;
  provider: "google";
  access_token: string | null;
  refresh_token: string;
  expires_at: string | null;
  calendar_id: string;
  sync_token: string | null;
  connected_at: string;
  updated_at: string;
};

type CalendarContext = {
  inquiry: InquiryRow;
  listing: ListingRow | null;
  operatorProfile: ProfileRow | null;
  integration: OperatorCalendarIntegration | null;
};

type BookingWindowRecord = {
  inquiry: InquiryRow;
  listing: ListingRow | null;
  window: CalendarWindow | null;
};

type CalendarWindow = {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  durationDays: number;
};

type LocalConflict = {
  source: "supabase";
  inquiryId: string;
  travelerName: string;
  listingTitle: string;
  status: InquiryRow["status"];
  startDate: string;
  endDate: string;
};

type GoogleConflict = {
  source: "google";
  eventId: string;
  summary: string;
  startDate: string;
  endDate: string;
};

type GoogleCalendarEvent = {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
  extendedProperties?: { private?: Record<string, string | undefined> | null } | null;
};

type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[];
  nextSyncToken?: string | null;
};

type GoogleFreeBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start?: string | null; end?: string | null }> }>;
};

type ConflictSummary = {
  ok: boolean;
  conflict?: true;
  source?: "supabase" | "google";
  errors?: string[];
  localConflicts?: LocalConflict[];
  googleConflicts?: GoogleConflict[];
  warning?: string;
};

const INQUIRY_CALENDAR_COLUMNS = [
  "google_calendar_event_id",
  "google_calendar_synced_at",
  "ical_uid",
  "calendar_sync_status",
  "calendar_conflict_status",
  "calendar_last_checked_at",
];
const inquiryCalendarColumnCache = new Map<string, Set<string>>();

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isMissingRelationOrSchemaCacheError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("Could not find the relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(error && (error.code === "42703" || error.message?.includes("column") || error.message?.includes("does not exist")));
}

function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!appUrl) {
    return "http://localhost:3000";
  }

  return appUrl.replace(/\/+$/, "");
}

function getGoogleRedirectUri() {
  const redirectUri = getRequiredEnv("GOOGLE_REDIRECT_URI").trim();

  if (!redirectUri) {
    throw new Error("Missing required environment variable: GOOGLE_REDIRECT_URI");
  }

  if (redirectUri.endsWith("/")) {
    throw new Error("GOOGLE_REDIRECT_URI must not end with a trailing slash.");
  }

  let parsedRedirectUri: URL;

  try {
    parsedRedirectUri = new URL(redirectUri);
  } catch {
    throw new Error("GOOGLE_REDIRECT_URI must be a valid absolute URL.");
  }

  const allowedCallbackPaths = new Set(["/api/google/calendar/callback", "/api/auth/callback/google"]);
  const expectedAppOrigin = new URL(getAppUrl()).origin;

  if (parsedRedirectUri.origin !== expectedAppOrigin || !allowedCallbackPaths.has(parsedRedirectUri.pathname)) {
    throw new Error(
      `GOOGLE_REDIRECT_URI must point at a supported Google callback on ${expectedAppOrigin}. Use /api/google/calendar/callback or /api/auth/callback/google and keep Google Cloud Console and .env.local aligned.`,
    );
  }

  return redirectUri;
}

export function getGoogleCalendarConfigStatus() {
  const missingKeys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].filter((key) => {
    const value = process.env[key]?.trim();
    return !value;
  });

  if (missingKeys.length > 0) {
    return {
      configured: false as const,
      message: `Google Calendar is not configured yet. Add ${missingKeys.join(", ")} to .env.local and restart the app.`,
    };
  }

  try {
    getGoogleRedirectUri();
    return { configured: true as const };
  } catch (error) {
    return {
      configured: false as const,
      message: error instanceof Error ? error.message : "Google Calendar configuration is invalid.",
    };
  }
}

function toIsoDateString(value: string) {
  return `${value}T00:00:00.000Z`;
}

function addUtcDays(date: Date, days: number) {
  const clone = new Date(date);
  clone.setUTCDate(clone.getUTCDate() + days);
  return clone;
}

function dateOnlyFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDisplayName(primary: string | null | undefined, fallback: string) {
  return primary && primary.trim().length > 0 ? primary.trim() : fallback;
}

function pickOperatorNames(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value && value.length > 0)))];
}

function parseDurationDays(duration: string | null | undefined) {
  if (!duration) {
    return 1;
  }

  const match = duration.match(/(\d+)/);
  if (!match) {
    return 1;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 30) : 1;
}

function resolveInquiryWindow(inquiry: InquiryRow, listing: ListingRow | null): CalendarWindow | null {
  const startDateValue = inquiry.preferred_start_date;

  if (!startDateValue) {
    return null;
  }

  const start = new Date(toIsoDateString(startDateValue));
  const preferredEnd = inquiry.preferred_end_date ? new Date(toIsoDateString(inquiry.preferred_end_date)) : null;
  const fallbackEnd = addUtcDays(start, Math.max(1, parseDurationDays(listing?.duration)));
  const end = preferredEnd && preferredEnd.getTime() > start.getTime() ? preferredEnd : fallbackEnd;

  return {
    start,
    end,
    startDate: dateOnlyFromDate(start),
    endDate: dateOnlyFromDate(end),
    durationDays: Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))),
  };
}

function isDateRangeOverlap(first: { start: Date; end: Date }, second: { start: Date; end: Date }) {
  return first.start.getTime() < second.end.getTime() && first.end.getTime() > second.start.getTime();
}

function parseGoogleEventWindow(event: {
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
}) {
  const startValue = event.start?.date ?? event.start?.dateTime ?? null;
  const endValue = event.end?.date ?? event.end?.dateTime ?? null;

  if (!startValue || !endValue) {
    return null;
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

async function getInquiryCalendarColumns() {
  const cached = inquiryCalendarColumnCache.get("inquiries");
  if (cached) {
    return cached;
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "inquiries")
    .in("column_name", INQUIRY_CALENDAR_COLUMNS);

  if (error || !data) {
    const empty = new Set<string>();
    inquiryCalendarColumnCache.set("inquiries", empty);
    return empty;
  }

  const columns = new Set<string>(data.map((entry) => String(entry.column_name)));
  inquiryCalendarColumnCache.set("inquiries", columns);
  return columns;
}

async function resolveOperatorProfileByName(admin: ReturnType<typeof createSupabaseServiceRoleClient>, names: Array<string | null | undefined>) {
  const operatorNames = pickOperatorNames(names);

  for (const operatorName of operatorNames) {
    const queries = [
      admin.from("profiles").select("id,email,full_name,role").eq("role", "operator").eq("full_name", operatorName),
      admin.from("profiles").select("id,email,full_name,role").eq("role", "operator").eq("email", operatorName),
    ] as const;

    for (const query of queries) {
      const { data, error } = await query;

      if (error) {
        if (isMissingRelationOrSchemaCacheError(error) || isMissingColumnError(error)) {
          return null;
        }

        throw new Error(error.message);
      }

      const match = (data ?? []).find((profile) => profile.role === "operator");
      if (match) {
        return match as ProfileRow;
      }
    }
  }

  return null;
}

async function updateInquiryCalendarFields(
  inquiryId: string,
  fields: Partial<Record<(typeof INQUIRY_CALENDAR_COLUMNS)[number], string | null>>,
) {
  const columns = await getInquiryCalendarColumns();
  const filtered = Object.fromEntries(
    Object.entries(fields).filter(([key]) => columns.has(key)),
  ) as Partial<Record<(typeof INQUIRY_CALENDAR_COLUMNS)[number], string | null>>;

  if (Object.keys(filtered).length === 0) {
    return;
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("inquiries").update(filtered).eq("id", inquiryId);

  if (error && !isMissingColumnError(error) && !isMissingRelationOrSchemaCacheError(error)) {
    throw new Error(error.message);
  }
}

async function fetchOperatorConfirmedInquiries(params: {
  operatorId: string | null;
  operatorName?: string | null;
  excludeInquiryId?: string | null;
}) {
  const admin = createSupabaseServiceRoleClient();
  const fullColumns =
    "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,google_calendar_event_id,google_calendar_synced_at,ical_uid,calendar_sync_status,calendar_conflict_status,calendar_last_checked_at,created_at,updated_at";
  const reducedColumns =
    "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at";
  type InquiryQueryResult = {
    data: Array<Record<string, unknown>> | null;
    error: { code?: string | null; message: string } | null;
  };

  async function queryByOperatorName(operatorName: string) {
    return admin
      .from("inquiries")
      .select(fullColumns)
      .eq("operator_name", operatorName)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false });
  }

  let result: InquiryQueryResult =
    params.operatorId
      ? ((await admin
          .from("inquiries")
          .select(fullColumns)
          .eq("operator_id", params.operatorId)
          .eq("status", "confirmed")
          .order("created_at", { ascending: false })) as InquiryQueryResult)
      : { data: null, error: null };

  if (result.error && isMissingColumnError(result.error)) {
    result = params.operatorId
      ? ((await admin
          .from("inquiries")
          .select(reducedColumns)
          .eq("operator_id", params.operatorId)
          .eq("status", "confirmed")
          .order("created_at", { ascending: false })) as InquiryQueryResult)
      : { data: null, error: null };
  }

  if (params.operatorName && (!result.data || (Array.isArray(result.data) && result.data.length === 0))) {
    const fallbackResult = await queryByOperatorName(params.operatorName);
    if (fallbackResult.error && isMissingColumnError(fallbackResult.error)) {
      const reducedFallback = (await admin
        .from("inquiries")
        .select(reducedColumns)
        .eq("operator_name", params.operatorName)
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })) as InquiryQueryResult;

      if (!reducedFallback.error && reducedFallback.data && reducedFallback.data.length > 0) {
        result = reducedFallback;
      } else if (!result.data) {
        result = reducedFallback;
      }
    } else if (!fallbackResult.error && fallbackResult.data && fallbackResult.data.length > 0) {
      result = fallbackResult;
    } else if (!result.data) {
      result = fallbackResult;
    }
  }

  const { data, error } = result;

  if (error) {
    if (isMissingColumnError(error) || isMissingRelationOrSchemaCacheError(error)) {
      return [] as BookingWindowRecord[];
    }

    throw new Error(error.message);
  }

  const inquiries = ((data ?? []) as InquiryRow[]).filter((inquiry) => inquiry.id !== params.excludeInquiryId);
  const listingIds = [...new Set(inquiries.map((inquiry) => inquiry.listing_id).filter((value): value is string => Boolean(value)))];

  const listingsById = new Map<string, ListingRow>();

  if (listingIds.length) {
    const { data: listingsData, error: listingsError } = await admin
      .from("tour_listings")
      .select("id,title,location,operator_id,operator_name,duration")
      .in("id", listingIds);

    if (listingsError) {
      if (!isMissingColumnError(listingsError) && !isMissingRelationOrSchemaCacheError(listingsError)) {
        throw new Error(listingsError.message);
      }
    } else {
      for (const listing of (listingsData ?? []) as ListingRow[]) {
        listingsById.set(listing.id, listing);
      }
    }
  }

  return inquiries.map((inquiry): BookingWindowRecord => ({
    inquiry,
    listing: inquiry.listing_id ? listingsById.get(inquiry.listing_id) ?? null : null,
    window: resolveInquiryWindow(inquiry, inquiry.listing_id ? listingsById.get(inquiry.listing_id) ?? null : null),
  }));
}

async function findLocalConflict(
  operatorId: string,
  operatorName: string | null | undefined,
  targetWindow: CalendarWindow,
  excludeInquiryId?: string | null,
): Promise<LocalConflict | null> {
  const bookings = await fetchOperatorConfirmedInquiries({
    operatorId,
    operatorName,
    excludeInquiryId,
  });

  for (const booking of bookings) {
    if (!booking.window) {
      continue;
    }

    if (isDateRangeOverlap(targetWindow, booking.window)) {
      return {
        source: "supabase",
        inquiryId: booking.inquiry.id,
        travelerName: buildDisplayName(booking.inquiry.traveler_name, "Traveler"),
        listingTitle: booking.listing?.title ?? booking.inquiry.destination,
        status: booking.inquiry.status,
        startDate: booking.window.startDate,
        endDate: booking.window.endDate,
      };
    }
  }

  return null;
}

function createGoogleOAuthClient() {
  const configStatus = getGoogleCalendarConfigStatus();

  if (!configStatus.configured) {
    throw new Error(configStatus.message);
  }

  const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = getGoogleRedirectUri();

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

function createGoogleCalendarClient(oauth2Client: OAuth2Client) {
  const calendarBaseUrl = "https://www.googleapis.com/calendar/v3";
  const calendarPath = (calendarId: string) =>
    `${calendarBaseUrl}/calendars/${encodeURIComponent(calendarId)}`;

  return {
    events: {
      async list(params: {
        calendarId: string;
        singleEvents?: boolean;
        showDeleted?: boolean;
        timeMin?: string;
        timeMax?: string;
        syncToken?: string;
        maxResults?: number;
      }) {
        return oauth2Client.request<GoogleEventsListResponse>({
          url: `${calendarPath(params.calendarId)}/events`,
          method: "GET",
          params: {
            singleEvents: params.singleEvents,
            showDeleted: params.showDeleted,
            timeMin: params.timeMin,
            timeMax: params.timeMax,
            syncToken: params.syncToken,
            maxResults: params.maxResults,
          },
        });
      },
      async insert(params: {
        calendarId: string;
        requestBody: Record<string, unknown>;
        sendUpdates?: string;
      }) {
        return oauth2Client.request<{ id?: string | null }>({
          url: `${calendarPath(params.calendarId)}/events`,
          method: "POST",
          params: { sendUpdates: params.sendUpdates },
          data: params.requestBody,
        });
      },
      async update(params: {
        calendarId: string;
        eventId: string;
        requestBody: Record<string, unknown>;
        sendUpdates?: string;
      }) {
        return oauth2Client.request<{ id?: string | null }>({
          url: `${calendarPath(params.calendarId)}/events/${encodeURIComponent(params.eventId)}`,
          method: "PUT",
          params: { sendUpdates: params.sendUpdates },
          data: params.requestBody,
        });
      },
      async delete(params: {
        calendarId: string;
        eventId: string;
        sendUpdates?: string;
      }) {
        return oauth2Client.request<void>({
          url: `${calendarPath(params.calendarId)}/events/${encodeURIComponent(params.eventId)}`,
          method: "DELETE",
          params: { sendUpdates: params.sendUpdates },
        });
      },
    },
    freebusy: {
      async query(params: {
        requestBody: {
          timeMin: string;
          timeMax: string;
          items: Array<{ id: string }>;
        };
      }) {
        return oauth2Client.request<GoogleFreeBusyResponse>({
          url: `${calendarBaseUrl}/freeBusy`,
          method: "POST",
          data: params.requestBody,
        });
      },
    },
  };
}

async function loadCalendarContext(inquiryId: string): Promise<CalendarContext | null> {
  const admin = createSupabaseServiceRoleClient();

  async function fetchInquiry() {
    return admin
      .from("inquiries")
      .select(
        "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,google_calendar_event_id,google_calendar_synced_at,ical_uid,calendar_sync_status,calendar_conflict_status,calendar_last_checked_at,created_at,updated_at",
      )
      .eq("id", inquiryId)
      .maybeSingle();
  }

  let inquiryResult = await fetchInquiry();

  if (inquiryResult.error && isMissingColumnError(inquiryResult.error)) {
    inquiryResult = await admin
      .from("inquiries")
      .select(
        "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,created_at,updated_at",
      )
      .eq("id", inquiryId)
      .maybeSingle();
  }

  const { data: inquiry, error: inquiryError } = inquiryResult;

  if (inquiryError || !inquiry) {
    if (inquiryError && (isMissingColumnError(inquiryError) || isMissingRelationOrSchemaCacheError(inquiryError))) {
      return null;
    }

    throw new Error(inquiryError?.message ?? "Unable to load inquiry.");
  }

  let listing: ListingRow | null = null;

  if (inquiry.listing_id) {
    const { data: listingData, error: listingError } = await admin
      .from("tour_listings")
      .select("id,title,location,operator_id,operator_name")
      .eq("id", inquiry.listing_id)
      .maybeSingle();

    if (listingError) {
      if (isMissingRelationOrSchemaCacheError(listingError)) {
        listing = null;
      } else {
        throw new Error(listingError.message);
      }
    } else {
      listing = (listingData ?? null) as ListingRow | null;
    }
  }

  const operatorName = inquiry.operator_name ?? listing?.operator_name ?? null;
  let operatorId = inquiry.operator_id ?? listing?.operator_id ?? null;
  let operatorProfile: ProfileRow | null = null;
  let integration: OperatorCalendarIntegration | null = null;

  if (operatorId) {
    const { data: profileData, error: profileError } = await admin
      .from("profiles")
      .select("id,email,full_name,role")
      .eq("id", operatorId)
      .maybeSingle();

    if (profileError) {
      if (!isMissingRelationOrSchemaCacheError(profileError)) {
        throw new Error(profileError.message);
      }
    } else {
      operatorProfile = (profileData ?? null) as ProfileRow | null;
    }
  } else if (operatorName) {
    operatorProfile = await resolveOperatorProfileByName(admin, [operatorName, listing?.operator_name, inquiry.operator_name]);
    operatorId = operatorProfile?.id ?? null;
  }

  if (operatorProfile && !operatorId) {
    operatorId = operatorProfile.id;
  }

  if (operatorId) {
    const { data: integrationData, error: integrationError } = await admin
      .from("operator_calendar_integrations")
      .select(
        "id,operator_id,provider,access_token,refresh_token,expires_at,calendar_id,sync_token,connected_at,updated_at",
      )
      .eq("operator_id", operatorId)
      .eq("provider", "google")
      .maybeSingle();

    if (integrationError) {
      if (!isMissingRelationOrSchemaCacheError(integrationError)) {
        throw new Error(integrationError.message);
      }
    } else {
      integration = (integrationData ?? null) as OperatorCalendarIntegration | null;
    }
  }

  return {
    inquiry: inquiry as InquiryRow,
    listing,
    operatorProfile,
    integration,
  };
}

function resolveInquiryTiming(inquiry: InquiryRow): CalendarWindow | null {
  if (!inquiry.preferred_start_date) {
    return null;
  }

  const start = new Date(toIsoDateString(inquiry.preferred_start_date));
  const resolvedEndDate = inquiry.preferred_end_date
    ? new Date(toIsoDateString(inquiry.preferred_end_date))
    : addUtcDays(start, 1);

  const end = resolvedEndDate.getTime() > start.getTime() ? resolvedEndDate : addUtcDays(start, 1);

  return {
    start,
    end,
    startDate: dateOnlyFromDate(start),
    endDate: dateOnlyFromDate(end),
    durationDays: Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))),
  };
}

function buildEventSummary(context: CalendarContext) {
  const listingTitle = context.listing?.title ?? context.inquiry.destination;
  const travelerName = buildDisplayName(context.inquiry.traveler_name, "Traveler");
  return `${listingTitle} - ${travelerName}`;
}

function buildEventDescription(context: CalendarContext) {
  const appUrl = getAppUrl();
  const sections = [
    `Traveler: ${buildDisplayName(context.inquiry.traveler_name, "Traveler")}`,
    `Email: ${context.inquiry.traveler_email}`,
    context.inquiry.traveler_phone ? `Phone: ${context.inquiry.traveler_phone}` : null,
    `Experience: ${context.listing?.title ?? context.inquiry.destination}`,
    `Operator: ${context.operatorProfile?.full_name ?? context.inquiry.operator_name}`,
    context.inquiry.notes ? `Notes: ${context.inquiry.notes}` : null,
    `TT Connect: ${appUrl}`,
  ].filter(Boolean);

  return sections.join("\n");
}

function buildCalendarEvent(context: CalendarContext) {
  const timing = resolveInquiryTiming(context.inquiry);

  if (!timing) {
    return null;
  }

  const listingLocation = context.listing?.location ?? context.inquiry.destination;
  const travelerEmail = context.inquiry.traveler_email.trim();

  return {
    summary: buildEventSummary(context),
    description: buildEventDescription(context),
    location: listingLocation,
    transparency: "opaque",
    visibility: "private",
    start: {
      date: timing.startDate,
    },
    end: {
      date: timing.endDate,
    },
    attendees: travelerEmail
      ? [
          {
            email: travelerEmail,
            displayName: buildDisplayName(context.inquiry.traveler_name, "Traveler"),
          },
        ]
      : undefined,
    extendedProperties: {
      private: {
        inquiryId: context.inquiry.id,
        operatorId: context.integration?.operator_id ?? context.inquiry.operator_id ?? "",
        source: "tt-connect",
      },
    },
  };
}

async function getCalendarClientForOperator(operatorId: string) {
  const admin = createSupabaseServiceRoleClient();
  const { data: integration, error } = await admin
    .from("operator_calendar_integrations")
    .select(
      "id,operator_id,provider,access_token,refresh_token,expires_at,calendar_id,sync_token,connected_at,updated_at",
    )
    .eq("operator_id", operatorId)
    .eq("provider", "google")
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  if (!integration) {
    return null;
  }

  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials({
    access_token: integration.access_token ?? undefined,
    refresh_token: integration.refresh_token,
    expiry_date: integration.expires_at ? new Date(integration.expires_at).getTime() : undefined,
  });

  return {
    oauth2Client,
    calendar: createGoogleCalendarClient(oauth2Client),
    integration: integration as OperatorCalendarIntegration,
  };
}

export async function listGoogleCalendarEvents(params: {
  operatorId: string;
  timeMin: string;
  timeMax: string;
  syncToken?: string | null;
}) {
  const client = await getCalendarClientForOperator(params.operatorId);

  if (!client) {
    return { ok: true, skipped: true as const, events: [] as unknown[] };
  }

  const calendarId = client.integration.calendar_id || "primary";

  const response = await client.calendar.events.list({
    calendarId,
    singleEvents: true,
    showDeleted: true,
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    syncToken: params.syncToken ?? undefined,
    maxResults: 250,
  });

  return {
    ok: true,
    events: (response.data.items ?? []) as unknown[],
    nextSyncToken: response.data.nextSyncToken ?? null,
  };
}

async function checkGoogleCalendarConflictsInternal(
  context: CalendarContext,
  targetWindow: CalendarWindow,
  excludeInquiryId?: string | null,
): Promise<ConflictSummary> {
  const localConflict = await findLocalConflict(
    context.integration?.operator_id ?? context.inquiry.operator_id ?? context.listing?.operator_id ?? "",
    context.operatorProfile?.full_name ?? context.listing?.operator_name ?? context.inquiry.operator_name ?? null,
    targetWindow,
    excludeInquiryId,
  );

  if (localConflict) {
    return {
      ok: false,
      conflict: true,
      source: "supabase",
      localConflicts: [localConflict],
      errors: [],
    };
  }

  if (!context.integration) {
    return { ok: true };
  }

  const client = await getCalendarClientForOperator(context.integration.operator_id);
  if (!client) {
    return { ok: true };
  }

  const response = await client.calendar.freebusy.query({
    requestBody: {
      timeMin: targetWindow.start.toISOString(),
      timeMax: targetWindow.end.toISOString(),
      items: [{ id: context.integration.calendar_id || "primary" }],
    },
  });

  const busy = response.data.calendars?.[context.integration.calendar_id || "primary"]?.busy ?? [];
  const googleConflicts: GoogleConflict[] = busy.map((slot, index) => ({
    source: "google",
    eventId: `${context.integration?.calendar_id || "primary"}-busy-${index + 1}`,
    summary: "Busy",
    startDate: slot.start ?? targetWindow.start.toISOString(),
    endDate: slot.end ?? targetWindow.end.toISOString(),
  }));

  if (googleConflicts.length > 0) {
    return {
      ok: false,
      conflict: true,
      source: "google",
      googleConflicts,
      errors: [],
    };
  }

  return { ok: true };
}

async function persistCalendarSyncOutcome(
  inquiryId: string,
  fields: Partial<Record<(typeof INQUIRY_CALENDAR_COLUMNS)[number], string | null>>,
) {
  try {
    await updateInquiryCalendarFields(inquiryId, fields);
  } catch (error) {
    console.error("Unable to persist calendar sync outcome", {
      inquiryId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function persistIntegrationSyncToken(operatorId: string, syncToken: string | null) {
  if (!syncToken) {
    return;
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("operator_calendar_integrations")
    .update({ sync_token: syncToken, updated_at: new Date().toISOString() })
    .eq("operator_id", operatorId)
    .eq("provider", "google");

  if (error && !isMissingRelationOrSchemaCacheError(error) && !isMissingColumnError(error)) {
    console.error("Unable to persist Google sync token", {
      operatorId,
      error: error.message,
    });
  }
}

function getGoogleEventLinkedInquiryId(event: {
  id?: string | null;
  extendedProperties?: {
    private?: Record<string, string | undefined> | null;
  } | null;
}) {
  return (
    event.extendedProperties?.private?.inquiryId?.trim() ||
    event.extendedProperties?.private?.bookingId?.trim() ||
    event.id?.trim() ||
    null
  );
}

async function createOrUpdateGoogleCalendarEvent(
  context: CalendarContext,
  eventId: string | null,
  mode: "create" | "update" | "upsert",
) {
  if (!context.integration) {
    return { ok: true, skipped: true as const, warning: "Google Calendar is not connected." };
  }

  const client = await getCalendarClientForOperator(context.integration.operator_id);
  if (!client) {
    return { ok: true, skipped: true as const, warning: "Google Calendar is not connected." };
  }

  const event = buildCalendarEvent(context);
  if (!event) {
    return { ok: false, error: "Trip dates are missing." };
  }

  const shouldCheckConflicts = mode === "create" || !eventId;

  if (shouldCheckConflicts) {
    const timing = resolveInquiryTiming(context.inquiry);
    if (!timing) {
      return { ok: false, error: "Trip dates are missing." };
    }

    const conflictResult = await checkGoogleCalendarConflictsInternal(context, timing, context.inquiry.id);
    if (!conflictResult.ok && conflictResult.conflict) {
      return {
        ok: false,
        conflict: true,
        source: conflictResult.source,
        localConflicts: conflictResult.localConflicts,
        googleConflicts: conflictResult.googleConflicts,
        error:
          conflictResult.source === "supabase"
            ? "An overlapping confirmed booking already exists in Supabase."
            : "A Google Calendar conflict was detected for the selected time window.",
      };
    }
  }

  const calendarId = context.integration.calendar_id || "primary";
  const commonArgs = {
    calendarId,
    requestBody: {
      ...event,
      attendees: event.attendees,
    },
    sendUpdates: "none" as const,
  };

  let responseEventId = eventId;

  if (mode === "create" || (mode === "upsert" && !eventId)) {
    const response = await client.calendar.events.insert(commonArgs);
    responseEventId = response.data.id ?? null;
  } else if (eventId) {
    const response = await client.calendar.events.update({
      ...commonArgs,
      eventId,
    });
    responseEventId = response.data.id ?? eventId;
  }

  if (!responseEventId) {
    return { ok: false, error: "Unable to save the Google Calendar event." };
  }

  await persistCalendarSyncOutcome(context.inquiry.id, {
    google_calendar_event_id: responseEventId,
    google_calendar_synced_at: new Date().toISOString(),
    ical_uid:
      context.inquiry.ical_uid ??
      `ttconnect-${context.inquiry.id}@${new URL(getAppUrl()).hostname}`,
    calendar_sync_status: "synced",
    calendar_conflict_status: null,
    calendar_last_checked_at: new Date().toISOString(),
  });

  return {
    ok: true,
    synced: true as const,
    eventId: responseEventId,
  };
}

export function getGoogleOAuthClient() {
  return createGoogleOAuthClient();
}

export async function getOperatorGoogleCalendarClient(operatorId: string) {
  return getCalendarClientForOperator(operatorId);
}

export async function createGoogleCalendarEventForBooking(inquiryId: string) {
  const context = await loadCalendarContext(inquiryId);

  if (!context) {
    return { ok: false, error: "Booking context was not found." };
  }

  return createOrUpdateGoogleCalendarEvent(context, context.inquiry.google_calendar_event_id, "create");
}

export async function updateGoogleCalendarEventForBooking(inquiryId: string) {
  const context = await loadCalendarContext(inquiryId);

  if (!context) {
    return { ok: false, error: "Booking context was not found." };
  }

  return createOrUpdateGoogleCalendarEvent(context, context.inquiry.google_calendar_event_id, "update");
}

export async function deleteGoogleCalendarEventForBooking(inquiryId: string) {
  const context = await loadCalendarContext(inquiryId);

  if (!context) {
    return { ok: false, error: "Booking context was not found." };
  }

  if (!context.integration || !context.inquiry.google_calendar_event_id) {
    return { ok: true, skipped: true as const, warning: "No connected Google Calendar event was found." };
  }

  const client = await getCalendarClientForOperator(context.integration.operator_id);
  if (!client) {
    return { ok: true, skipped: true as const, warning: "Google Calendar is not connected." };
  }

  try {
    await client.calendar.events.delete({
      calendarId: context.integration.calendar_id || "primary",
      eventId: context.inquiry.google_calendar_event_id,
      sendUpdates: "none",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete the Google Calendar event.";
    console.error("Google Calendar deletion warning", {
      inquiryId,
      error: message,
    });
    return { ok: false, error: message };
  }

  await persistCalendarSyncOutcome(context.inquiry.id, {
    google_calendar_event_id: null,
    google_calendar_synced_at: new Date().toISOString(),
    calendar_sync_status: "deleted",
    calendar_conflict_status: "external_deleted",
    calendar_last_checked_at: new Date().toISOString(),
  });

  return { ok: true, synced: true as const };
}

export async function syncBookingToGoogleCalendar(inquiryId: string) {
  const context = await loadCalendarContext(inquiryId);

  if (!context) {
    return { ok: false, error: "Booking context was not found." };
  }

  if (!context.integration) {
    return { ok: true, skipped: true as const, warning: "Google Calendar is not connected." };
  }

  if (context.inquiry.status === "closed") {
    return deleteGoogleCalendarEventForBooking(inquiryId);
  }

  if (context.inquiry.status !== "confirmed") {
    return { ok: true, skipped: true as const, warning: "Only confirmed bookings are synced." };
  }

  return createOrUpdateGoogleCalendarEvent(context, context.inquiry.google_calendar_event_id, "upsert");
}

export async function checkGoogleCalendarConflicts(params: {
  operatorId: string;
  inquiryId?: string | null;
  start: Date;
  end: Date;
}) {
  const admin = createSupabaseServiceRoleClient();
  const { data: inquiryData, error } = await admin
    .from("inquiries")
    .select(
      "id,user_id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,availability,notes,status,google_calendar_event_id,google_calendar_synced_at,ical_uid,calendar_sync_status,calendar_conflict_status,calendar_last_checked_at,created_at,updated_at",
    )
    .eq("id", params.inquiryId ?? "")
    .maybeSingle();

  if (error && !isMissingColumnError(error) && !isMissingRelationOrSchemaCacheError(error)) {
    throw new Error(error.message);
  }

  const inquiry = inquiryData as InquiryRow | null;
  const listing = inquiry?.listing_id
    ? await (async () => {
        const { data, error: listingError } = await admin
          .from("tour_listings")
          .select("id,title,location,operator_id,operator_name,duration")
          .eq("id", inquiry.listing_id ?? "")
          .maybeSingle();

        if (listingError && !isMissingColumnError(listingError) && !isMissingRelationOrSchemaCacheError(listingError)) {
          throw new Error(listingError.message);
        }

        return (data ?? null) as ListingRow | null;
      })()
    : null;

  const operatorName = inquiry?.operator_name ?? listing?.operator_name ?? null;
  const operatorProfile = inquiry?.operator_id
    ? null
    : await resolveOperatorProfileByName(admin, [operatorName, listing?.operator_name]);

  const operatorId = inquiry?.operator_id ?? listing?.operator_id ?? operatorProfile?.id ?? params.operatorId;
  if (!operatorId) {
    return { ok: true } satisfies ConflictSummary;
  }

  const window = params.inquiryId && inquiry
    ? resolveInquiryWindow(inquiry, listing)
    : {
        start: params.start,
        end: params.end,
        startDate: params.start.toISOString().slice(0, 10),
        endDate: params.end.toISOString().slice(0, 10),
        durationDays: Math.max(1, Math.round((params.end.getTime() - params.start.getTime()) / (1000 * 60 * 60 * 24))),
      };

  if (!window) {
    return { ok: false, error: "Trip dates are missing." };
  }

  const context: CalendarContext = {
    inquiry: inquiry ?? ({
      id: params.inquiryId ?? "",
      user_id: null,
      listing_id: null,
      traveler_name: "Traveler",
      traveler_email: "",
      traveler_phone: null,
      destination: "Trip",
      destination_country: "",
      operator_name: "",
      operator_id: operatorId,
      preferred_start_date: window.startDate,
      preferred_end_date: window.endDate,
      availability: "flexible",
      notes: null,
      status: "confirmed",
      google_calendar_event_id: null,
      google_calendar_synced_at: null,
      ical_uid: null,
      calendar_sync_status: null,
      calendar_conflict_status: null,
      calendar_last_checked_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies InquiryRow),
    listing,
    operatorProfile: operatorProfile ?? (await (async () => {
      if (!operatorId) {
        return null;
      }

      const { data } = await admin.from("profiles").select("id,email,full_name,role").eq("id", operatorId).maybeSingle();
      return (data ?? null) as ProfileRow | null;
    })()),
    integration: await getOperatorCalendarIntegration(operatorId),
  };

  return checkGoogleCalendarConflictsInternal(context, window, params.inquiryId ?? undefined);
}

export async function checkGoogleCalendarConflictsForBooking(inquiryId: string) {
  const context = await loadCalendarContext(inquiryId);

  if (!context) {
    return { ok: false, error: "Booking context was not found." };
  }

  const timing = resolveInquiryTiming(context.inquiry);
  if (!timing) {
    return { ok: false, error: "Trip dates are missing." };
  }

  try {
    return checkGoogleCalendarConflictsInternal(context, timing, inquiryId);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to check Google Calendar conflicts.",
    };
  }
}

export async function pullGoogleCalendarChanges(operatorId: string) {
  const client = await getCalendarClientForOperator(operatorId);

  if (!client) {
    return { ok: true, skipped: true as const, eventsPulled: 0, conflictsFound: 0, updated: 0 };
  }

  const { integration } = client;
  const queryBase = {
    calendarId: integration.calendar_id || "primary",
    singleEvents: true,
    showDeleted: true,
    maxResults: 250,
  } as const;

  let response;

  try {
    response = integration.sync_token
      ? await client.calendar.events.list({
          ...queryBase,
          syncToken: integration.sync_token,
        })
      : await client.calendar.events.list({
          ...queryBase,
          timeMin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
        });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to pull Google Calendar changes.";
    if (message.includes("Sync token is no longer valid") || message.includes("410")) {
      response = await client.calendar.events.list({
        ...queryBase,
        timeMin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      });
    } else {
      console.error("Google Calendar pull warning", { operatorId, error: message });
      return { ok: false, error: message };
    }
  }

  const events = response?.data.items ?? [];
  const nextSyncToken = response?.data.nextSyncToken ?? null;
  const now = new Date().toISOString();
  const admin = createSupabaseServiceRoleClient();
  const { data: operatorProfileData } = await admin
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", operatorId)
    .maybeSingle();

  const bookingRows = await fetchOperatorConfirmedInquiries({
    operatorId,
    operatorName: operatorProfileData?.full_name ?? null,
  });
  const inquiryById = new Map(bookingRows.map((entry) => [entry.inquiry.id, entry]));
  const inquiryByGoogleEventId = new Map(
    bookingRows
      .filter((entry) => Boolean(entry.inquiry.google_calendar_event_id))
      .map((entry) => [entry.inquiry.google_calendar_event_id as string, entry]),
  );

  let conflictsFound = 0;
  let updated = 0;

  for (const event of events as Array<{
    id?: string | null;
    status?: string | null;
    summary?: string | null;
    start?: { date?: string | null; dateTime?: string | null } | null;
    end?: { date?: string | null; dateTime?: string | null } | null;
    extendedProperties?: { private?: Record<string, string | undefined> | null } | null;
  }>) {
    const linkedInquiryId = getGoogleEventLinkedInquiryId(event);
    const linkedBooking = linkedInquiryId
      ? inquiryById.get(linkedInquiryId) ?? inquiryByGoogleEventId.get(linkedInquiryId) ?? null
      : null;

    if (!linkedBooking) {
      continue;
    }

    const eventWindow = parseGoogleEventWindow(event);
    const currentWindow = linkedBooking.window;

    if (event.status === "cancelled") {
      conflictsFound += 1;
      updated += 1;
      const { error } = await admin
        .from("inquiries")
        .update({
          calendar_sync_status: "external_deleted",
          calendar_conflict_status: "external_deleted",
          calendar_last_checked_at: now,
          google_calendar_synced_at: now,
        })
        .eq("id", linkedBooking.inquiry.id);

      if (error && !isMissingColumnError(error) && !isMissingRelationOrSchemaCacheError(error)) {
        console.error("Failed to mark externally deleted Google Calendar event", {
          operatorId,
          inquiryId: linkedBooking.inquiry.id,
          error: error.message,
        });
      }

      continue;
    }

    if (!eventWindow || !currentWindow) {
      const { error } = await admin
        .from("inquiries")
        .update({
          calendar_sync_status: "manual_review",
          calendar_conflict_status: "manual_review",
          calendar_last_checked_at: now,
        })
        .eq("id", linkedBooking.inquiry.id);

      if (error && !isMissingColumnError(error) && !isMissingRelationOrSchemaCacheError(error)) {
        console.error("Failed to record manual review status for Google Calendar event", {
          operatorId,
          inquiryId: linkedBooking.inquiry.id,
          error: error.message,
        });
      }

      conflictsFound += 1;
      updated += 1;
      continue;
    }

    const changed = eventWindow.start.toISOString() !== currentWindow.start.toISOString() || eventWindow.end.toISOString() !== currentWindow.end.toISOString();
    const externalConflict = await findLocalConflict(
      operatorId,
      linkedBooking.inquiry.operator_name ?? linkedBooking.listing?.operator_name ?? null,
      {
        start: eventWindow.start,
        end: eventWindow.end,
        startDate: eventWindow.start.toISOString().slice(0, 10),
        endDate: eventWindow.end.toISOString().slice(0, 10),
        durationDays: Math.max(1, Math.round((eventWindow.end.getTime() - eventWindow.start.getTime()) / (1000 * 60 * 60 * 24))),
      },
      linkedBooking.inquiry.id,
    );

    if (externalConflict) {
      conflictsFound += 1;
      updated += 1;
      const { error } = await admin
        .from("inquiries")
        .update({
          calendar_sync_status: "conflict",
          calendar_conflict_status: "manual_review",
          calendar_last_checked_at: now,
        })
        .eq("id", linkedBooking.inquiry.id);

      if (error && !isMissingColumnError(error) && !isMissingRelationOrSchemaCacheError(error)) {
        console.error("Failed to record Google Calendar conflict", {
          operatorId,
          inquiryId: linkedBooking.inquiry.id,
          error: error.message,
        });
      }

      continue;
    }

    if (changed) {
      const nextStart = eventWindow.start.toISOString().slice(0, 10);
      const nextEnd = eventWindow.end.toISOString().slice(0, 10);
      const { error } = await admin
        .from("inquiries")
        .update({
          preferred_start_date: nextStart,
          preferred_end_date: nextEnd,
          calendar_sync_status: "external_updated",
          calendar_conflict_status: null,
          calendar_last_checked_at: now,
          google_calendar_synced_at: now,
        })
        .eq("id", linkedBooking.inquiry.id);

      if (error && !isMissingColumnError(error) && !isMissingRelationOrSchemaCacheError(error)) {
        console.error("Failed to apply safe Google Calendar change", {
          operatorId,
          inquiryId: linkedBooking.inquiry.id,
          error: error.message,
        });
      } else {
        updated += 1;
      }
      continue;
    }

    const { error } = await admin
      .from("inquiries")
      .update({
        calendar_sync_status: "synced",
        calendar_conflict_status: null,
        calendar_last_checked_at: now,
      })
      .eq("id", linkedBooking.inquiry.id);

    if (error && !isMissingColumnError(error) && !isMissingRelationOrSchemaCacheError(error)) {
      console.error("Failed to record Google Calendar sync check", {
        operatorId,
        inquiryId: linkedBooking.inquiry.id,
        error: error.message,
      });
    } else {
      updated += 1;
    }
  }

  if (nextSyncToken) {
    await persistIntegrationSyncToken(operatorId, nextSyncToken);
  }

  return {
    ok: true,
    eventsPulled: events.length,
    conflictsFound,
    updated,
    nextSyncToken,
  };
}

export async function upsertGoogleCalendarConnection(params: {
  operatorId: string;
  accessToken: string | null;
  refreshToken: string;
  expiresAt: string | null;
  calendarId?: string | null;
  syncToken?: string | null;
}) {
  const admin = createSupabaseServiceRoleClient();
  const calendarId = params.calendarId?.trim() || "primary";

  const payload = {
    operator_id: params.operatorId,
    provider: "google" as const,
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
    expires_at: params.expiresAt,
    calendar_id: calendarId,
    sync_token: params.syncToken ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("operator_calendar_integrations").upsert(payload, {
    onConflict: "operator_id,provider",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getOperatorCalendarIntegration(operatorId: string) {
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("operator_calendar_integrations")
    .select(
      "id,operator_id,provider,access_token,refresh_token,expires_at,calendar_id,sync_token,connected_at,updated_at",
    )
    .eq("operator_id", operatorId)
    .eq("provider", "google")
    .maybeSingle();

  if (error) {
    if (isMissingRelationOrSchemaCacheError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (data ?? null) as OperatorCalendarIntegration | null;
}
