import "server-only";

import crypto from "node:crypto";

type IcalFeedEvent = {
  uid: string;
  dtstamp: string;
  startDate: string;
  endDate: string;
  summary: string;
  description: string;
  location?: string | null;
};

function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!appUrl) {
    return "http://localhost:3000";
  }

  return appUrl.replace(/\/+$/, "");
}

function getIcalFeedSecret() {
  return process.env.ICAL_FEED_SECRET?.trim() || null;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signFeedPayload(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function buildOperatorIcalFeedUrl(operatorId: string) {
  const appUrl = getAppUrl();
  const secret = getIcalFeedSecret();

  if (!secret) {
    return `${appUrl}/api/operator/calendar/ical`;
  }

  const payload = base64UrlEncode(
    JSON.stringify({
      operatorId,
      purpose: "operator-calendar-feed",
    }),
  );
  const signature = signFeedPayload(payload, secret);

  return `${appUrl}/api/operator/calendar/ical?token=${encodeURIComponent(`${payload}.${signature}`)}`;
}

export function verifyIcalFeedToken(token: string) {
  const secret = getIcalFeedSecret();

  if (!secret) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signFeedPayload(payload, secret);

  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as {
      operatorId?: string;
      purpose?: string;
    };

    if (parsed.purpose !== "operator-calendar-feed" || typeof parsed.operatorId !== "string") {
      return null;
    }

    return parsed.operatorId;
  } catch {
    return null;
  }
}

function escapeIcalText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcalDate(date: string) {
  return date.replace(/-/g, "");
}

export function formatIcalDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function serializeIcalFeed(events: IcalFeedEvent[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TT Connect//Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcalText(event.uid)}`);
    lines.push(`DTSTAMP:${escapeIcalText(event.dtstamp)}`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(event.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcalDate(event.endDate)}`);
    lines.push(`SUMMARY:${escapeIcalText(event.summary)}`);
    lines.push(`DESCRIPTION:${escapeIcalText(event.description)}`);

    if (event.location) {
      lines.push(`LOCATION:${escapeIcalText(event.location)}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return `${lines.join("\r\n")}\r\n`;
}
