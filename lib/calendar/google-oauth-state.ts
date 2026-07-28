import "server-only";

import crypto from "node:crypto";

const OAUTH_STATE_PURPOSE = "google-calendar-operator-connect";
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const OAUTH_STATE_CLOCK_SKEW_SECONDS = 60;
const MAX_STATE_LENGTH = 2_048;

type GoogleCalendarOAuthStatePayload = {
  issuedAt: number;
  nonce: string;
  operatorId: string;
  purpose: typeof OAUTH_STATE_PURPOSE;
};

function getOAuthStateSecret() {
  const secret =
    process.env.GOOGLE_OAUTH_STATE_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!secret) {
    throw new Error("Google Calendar OAuth state signing is not configured.");
  }

  return secret;
}

function signPayload(payload: string) {
  return crypto
    .createHmac("sha256", getOAuthStateSecret())
    .update(`${OAUTH_STATE_PURPOSE}:${payload}`)
    .digest("base64url");
}

function stringsMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createGoogleCalendarOAuthState(operatorId: string) {
  const payload: GoogleCalendarOAuthStatePayload = {
    issuedAt: Math.floor(Date.now() / 1_000),
    nonce: crypto.randomBytes(24).toString("base64url"),
    operatorId,
    purpose: OAUTH_STATE_PURPOSE,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyGoogleCalendarOAuthState({
  cookieState,
  currentOperatorId,
  returnedState,
}: {
  cookieState: string | null;
  currentOperatorId: string;
  returnedState: string | null;
}) {
  if (
    !cookieState ||
    !returnedState ||
    cookieState.length > MAX_STATE_LENGTH ||
    returnedState.length > MAX_STATE_LENGTH ||
    !stringsMatch(cookieState, returnedState)
  ) {
    return false;
  }

  const stateParts = returnedState.split(".");

  if (stateParts.length !== 2) {
    return false;
  }

  const [encodedPayload, providedSignature] = stateParts;

  if (
    !encodedPayload ||
    !providedSignature ||
    !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
    !/^[A-Za-z0-9_-]+$/.test(providedSignature)
  ) {
    return false;
  }

  let expectedSignature: string;

  try {
    expectedSignature = signPayload(encodedPayload);
  } catch {
    return false;
  }

  if (!stringsMatch(providedSignature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<GoogleCalendarOAuthStatePayload>;
    const now = Math.floor(Date.now() / 1_000);

    return (
      payload.purpose === OAUTH_STATE_PURPOSE &&
      payload.operatorId === currentOperatorId &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 32 &&
      typeof payload.issuedAt === "number" &&
      Number.isInteger(payload.issuedAt) &&
      payload.issuedAt <= now + OAUTH_STATE_CLOCK_SKEW_SECONDS &&
      now - payload.issuedAt <= OAUTH_STATE_MAX_AGE_SECONDS
    );
  } catch {
    return false;
  }
}
