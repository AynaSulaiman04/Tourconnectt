import "server-only";

import crypto from "node:crypto";
import type { WiPayPaymentSummary } from "@/lib/supabase/inquiry-types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type WiPayPaymentStatus =
  | "pending"
  | "initiated"
  | "paid"
  | "completed"
  | "success"
  | "failed"
  | "error"
  | "cancelled"
  | "refunded";
export type WiPayCanonicalPaymentStatus =
  | "pending"
  | "initiated"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";
export type { WiPayPaymentSummary } from "@/lib/supabase/inquiry-types";

export const PLATFORM_ADMIN_COMMISSION_RATE = 0.2;
export const OPERATOR_PAYOUT_RATE = 0.8;
const WIPAY_REQUEST_TIMEOUT_MS = 20_000;
export const WIPAY_WEBHOOK_REPLAY_TOLERANCE_SECONDS = 5 * 60;

export type PaymentSettlementBreakdown = {
  grossAmount: number;
  adminCommissionAmount: number;
  operatorPayoutAmount: number;
  adminCommissionRate: number;
  operatorPayoutRate: number;
};

type WiPayHostedCheckoutOptions = {
  inquiryId: string;
  orderId: string;
  amount: string;
  currency: string;
  countryCode: string;
  responseUrl: string;
  travelerEmail: string;
};

type WiPayCheckoutResponse = {
  url?: string | null;
  checkout_url?: string | null;
  redirect_url?: string | null;
  payment_url?: string | null;
  data?: {
    url?: string | null;
    checkout_url?: string | null;
    redirect_url?: string | null;
    payment_url?: string | null;
    transaction_id?: string | null;
    transactionId?: string | null;
    [key: string]: unknown;
  } | null;
  transaction_id?: string | null;
  transactionId?: string | null;
  [key: string]: unknown;
};

type WiPayCallbackPayload = {
  order_id: string;
  status: string;
  transaction_id: string | null;
  total: string | null;
  currency: string | null;
  message: string | null;
  hash: string | null;
  date: string | null;
  card: string | null;
  data: Record<string, unknown> | null;
};

function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!appUrl) {
    return "http://localhost:3000";
  }

  return appUrl.replace(/\/+$/, "");
}

function getFirstConfiguredEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function getOptionalEnv(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function getWiPayApiBaseUrl() {
  return getOptionalEnv("WIPAY_API_BASE_URL", "https://tt.wipayfinancial.com/plugins/payments/request").replace(/\/+$/, "");
}

function getWiPayAccountNumber() {
  const value = getFirstConfiguredEnv("WIPAY_ACCOUNT_NUMBER", "WIPAY_DEVELOPER_ID");

  if (!value) {
    throw new Error("Missing required environment variable: WIPAY_ACCOUNT_NUMBER");
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("WIPAY_ACCOUNT_NUMBER must contain digits only.");
  }

  return value;
}

function getWiPayApiKey() {
  const value = getFirstConfiguredEnv("WIPAY_API_KEY", "WIPAY_BUSINESS_KEY");

  if (!value) {
    throw new Error("Missing required environment variable: WIPAY_API_KEY");
  }

  return value;
}

export function getWiPayWebhookSecret() {
  return getFirstConfiguredEnv("WIPAY_WEBHOOK_SECRET");
}

function getWiPayCurrency() {
  return getOptionalEnv("WIPAY_CURRENCY", "TTD").toUpperCase();
}

function getWiPayCountryCode() {
  return getOptionalEnv("WIPAY_COUNTRY_CODE", "TT").toUpperCase();
}

export function getWiPayConfigStatus() {
  const missingKeys = [
    !getFirstConfiguredEnv("WIPAY_ACCOUNT_NUMBER", "WIPAY_DEVELOPER_ID")
      ? "WIPAY_ACCOUNT_NUMBER (or WIPAY_DEVELOPER_ID)"
      : null,
    !getFirstConfiguredEnv("WIPAY_API_KEY", "WIPAY_BUSINESS_KEY")
      ? "WIPAY_API_KEY (or WIPAY_BUSINESS_KEY)"
      : null,
  ].filter((key): key is string => Boolean(key));

  if (missingKeys.length > 0) {
    return {
      configured: false as const,
      message: `WiPay is not configured yet. Add ${missingKeys.join(", ")} to .env.local and restart the app.`,
    };
  }

  return {
    configured: true as const,
    currency: getWiPayCurrency(),
    countryCode: getWiPayCountryCode(),
    environment: getOptionalEnv("WIPAY_ENVIRONMENT", "sandbox"),
  };
}

function normalizeStatus(value: string | null | undefined): WiPayCanonicalPaymentStatus | null {
  const status = value?.trim().toLowerCase() ?? "";

  if (["paid", "completed", "success"].includes(status)) {
    return "paid";
  }

  if (status === "initiated") {
    return "initiated";
  }

  if (status === "failed" || status === "error") {
    return "failed";
  }

  if (status === "cancelled" || status === "canceled") {
    return "cancelled";
  }

  if (status === "refunded") {
    return "refunded";
  }

  if (status === "pending") {
    return "pending";
  }

  return null;
}

function normalizeAmount(value: string | number) {
  const raw = typeof value === "number" ? String(value) : value;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const parsed = Number.parseFloat(cleaned);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed.toFixed(2);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function parseWiPayAmount(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return normalizeAmount(value);
}

export function calculatePaymentSettlement(amount: string | number | null | undefined): PaymentSettlementBreakdown | null {
  const normalizedAmount =
    typeof amount === "number" ? normalizeAmount(amount) : typeof amount === "string" ? normalizeAmount(amount) : null;

  if (!normalizedAmount) {
    return null;
  }

  const grossAmount = Number.parseFloat(normalizedAmount);
  const adminCommissionAmount = roundCurrency(grossAmount * PLATFORM_ADMIN_COMMISSION_RATE);
  const operatorPayoutAmount = roundCurrency(grossAmount - adminCommissionAmount);

  return {
    grossAmount,
    adminCommissionAmount,
    operatorPayoutAmount,
    adminCommissionRate: PLATFORM_ADMIN_COMMISSION_RATE,
    operatorPayoutRate: OPERATOR_PAYOUT_RATE,
  };
}

export function resolveWiPayInquiryAmount(inquiry: {
  payment_amount?: string | number | null;
  listing?: { price?: string | number | null } | null;
}) {
  const rawAmount = inquiry.payment_amount ?? inquiry.listing?.price ?? null;
  return parseWiPayAmount(rawAmount == null ? null : String(rawAmount));
}

export function generateWiPayOrderId(inquiryId: string) {
  const seed = `${inquiryId}:${Date.now().toString(36)}:${crypto.randomBytes(6).toString("hex")}`;
  return `wp${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 14)}`;
}

export function buildWiPayCheckoutUrls(params: { inquiryId: string; orderId: string; outcome: "success" | "cancelled" }) {
  const appUrl = getAppUrl();
  const searchParams = new URLSearchParams({
    inquiryId: params.inquiryId,
    order_id: params.orderId,
    payment: params.outcome,
  });

  return {
    returnUrl: `${appUrl}/ConfirmationPage?${searchParams.toString()}`,
    cancelUrl: `${appUrl}/api/wipay/cancel?${searchParams.toString()}`,
    webhookUrl: `${appUrl}/api/wipay/webhook`,
  };
}

export function buildWiPayResponseUrl(params: { inquiryId: string; orderId: string; status?: string }) {
  const appUrl = getAppUrl();
  const searchParams = new URLSearchParams({
    inquiryId: params.inquiryId,
    order_id: params.orderId,
  });

  if (params.status) {
    searchParams.set("payment", params.status);
  }

  return `${appUrl}/api/payments/wipay/callback?${searchParams.toString()}`;
}

export function buildWiPayHostedCheckoutPayload(options: WiPayHostedCheckoutOptions) {
  return {
    account_number: getWiPayAccountNumber(),
    country_code: options.countryCode,
    currency: options.currency,
    environment: getOptionalEnv("WIPAY_ENVIRONMENT", "sandbox"),
    fee_structure: "customer_pay",
    method: "credit_card_co",
    order_id: options.orderId,
    origin: "TTConnect",
    response_url: options.responseUrl,
    total: options.amount,
    email: options.travelerEmail,
    data: JSON.stringify({
      inquiry_id: options.inquiryId,
    }),
    version: "1.0.0",
  };
}

function extractCheckoutUrl(data: WiPayCheckoutResponse | null) {
  const candidateValues = [
    data?.url,
    data?.checkout_url,
    data?.redirect_url,
    data?.payment_url,
    data?.data?.url,
    data?.data?.checkout_url,
    data?.data?.redirect_url,
    data?.data?.payment_url,
  ];

  return candidateValues.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? null;
}

export async function createWiPayHostedCheckoutSession(options: WiPayHostedCheckoutOptions) {
  const payload = buildWiPayHostedCheckoutPayload(options);
  const response = await fetch(getWiPayApiBaseUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(payload).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(WIPAY_REQUEST_TIMEOUT_MS),
  });

  const responseText = await response.text();
  let data: WiPayCheckoutResponse | null = null;

  try {
    data = responseText ? (JSON.parse(responseText) as WiPayCheckoutResponse) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      (data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : responseText) || `WiPay checkout request failed with status ${response.status}.`,
    );
  }

  const checkoutUrl = extractCheckoutUrl(data);

  if (!checkoutUrl) {
    throw new Error("WiPay did not return a checkout URL.");
  }

  return {
    checkoutUrl,
    transactionId:
      (data?.transaction_id && typeof data.transaction_id === "string" ? data.transaction_id : null) ??
      (data?.transactionId && typeof data.transactionId === "string" ? data.transactionId : null) ??
      null,
    responsePayload: data ?? {},
  };
}

export function verifyWiPayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
) {
  const match = signatureHeader?.trim().match(/^sha256=([a-f0-9]{64})$/i);
  if (!match) {
    return false;
  }

  const signatureBuffer = Buffer.from(match[1], "hex");
  const expectedBuffer = crypto.createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest();

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

export function isWiPayWebhookTimestampFresh(
  timestampHeader: string | null,
  nowMilliseconds = Date.now(),
) {
  if (!timestampHeader || !/^\d+$/.test(timestampHeader.trim())) {
    return false;
  }

  const timestampSeconds = Number(timestampHeader);
  if (!Number.isSafeInteger(timestampSeconds)) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(nowMilliseconds / 1000) - timestampSeconds);
  return ageSeconds <= WIPAY_WEBHOOK_REPLAY_TOLERANCE_SECONDS;
}

export function verifyWiPayCallbackHash(
  payload: Pick<WiPayCallbackPayload, "transaction_id" | "hash">,
  originalStoredTotal: string,
) {
  const receivedHash = payload.hash?.trim().toLowerCase() ?? "";
  const transactionId = payload.transaction_id?.trim() ?? "";
  if (!transactionId || !/^[a-f0-9]{32}$/.test(receivedHash)) {
    return false;
  }

  const expectedHash = crypto
    .createHash("md5")
    .update(`${transactionId}${originalStoredTotal}${getWiPayApiKey()}`, "utf8")
    .digest();
  const receivedBuffer = Buffer.from(receivedHash, "hex");

  if (receivedBuffer.length !== expectedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedHash);
}

export function normalizeWiPayCallbackStatus(value: string | null | undefined): WiPayCanonicalPaymentStatus | null {
  return normalizeStatus(value);
}

export function isSuccessfulWiPayPayment(status: string | null | undefined) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  return normalized === "paid" || normalized === "completed" || normalized === "success";
}

export function isPendingWiPayPayment(status: string | null | undefined) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  return normalized === "pending" || normalized === "initiated";
}

export function isFailedWiPayPayment(status: string | null | undefined) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  return normalized === "failed" || normalized === "error";
}

export async function getLatestWiPayPaymentForInquiry(inquiryId: string) {
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("wipay_payments")
    .select(
      "id,inquiry_id,provider,order_id,transaction_id,status,amount,currency,country_code,checkout_url,response_payload,webhook_payload,paid_at,cancelled_at,refunded_at,failed_at,created_at,updated_at",
    )
    .eq("inquiry_id", inquiryId)
    .eq("provider", "wipay")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? (data as WiPayPaymentSummary) : null;
}

export async function getWiPayPaymentByOrderId(orderId: string) {
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("wipay_payments")
    .select(
      "id,inquiry_id,provider,order_id,transaction_id,status,amount,currency,country_code,checkout_url,response_payload,webhook_payload,paid_at,cancelled_at,refunded_at,failed_at,created_at,updated_at",
    )
    .eq("order_id", orderId)
    .eq("provider", "wipay")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? (data as WiPayPaymentSummary) : null;
}

export async function getWiPayPaymentsForInquiryIds(inquiryIds: string[]) {
  const uniqueInquiryIds = [...new Set(inquiryIds.map((value) => value.trim()).filter((value) => Boolean(value)))];

  if (!uniqueInquiryIds.length) {
    return [] as WiPayPaymentSummary[];
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("wipay_payments")
    .select(
      "id,inquiry_id,provider,order_id,transaction_id,status,amount,currency,country_code,checkout_url,response_payload,webhook_payload,paid_at,cancelled_at,refunded_at,failed_at,created_at,updated_at",
    )
    .in("inquiry_id", uniqueInquiryIds)
    .eq("provider", "wipay")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WiPayPaymentSummary[];
}

export function sumSuccessfulWiPayPayments(payments: WiPayPaymentSummary[]) {
  return payments.reduce((total, payment) => {
    if (!isSuccessfulWiPayPayment(payment.status)) {
      return total;
    }

    const parsed = Number.parseFloat(payment.amount);
    return Number.isFinite(parsed) ? total + parsed : total;
  }, 0);
}

export function sumAdminCommission(payments: WiPayPaymentSummary[]) {
  return payments.reduce((total, payment) => {
    if (!isSuccessfulWiPayPayment(payment.status)) {
      return total;
    }

    const settlement = calculatePaymentSettlement(payment.amount);
    return total + (settlement?.adminCommissionAmount ?? 0);
  }, 0);
}

export function sumOperatorPayout(payments: WiPayPaymentSummary[]) {
  return payments.reduce((total, payment) => {
    if (!isSuccessfulWiPayPayment(payment.status)) {
      return total;
    }

    const settlement = calculatePaymentSettlement(payment.amount);
    return total + (settlement?.operatorPayoutAmount ?? 0);
  }, 0);
}

export async function createWiPayPaymentAttempt(params: {
  inquiryId: string;
  orderId: string;
  amount: string;
  currency: string;
  countryCode: string;
}) {
  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from("wipay_payments")
    .insert({
      inquiry_id: params.inquiryId,
      provider: "wipay",
      order_id: params.orderId,
      status: "pending",
      amount: params.amount,
      currency: params.currency,
      country_code: params.countryCode,
      response_payload: {
        created_from: "traveler_checkout",
        settlement: calculatePaymentSettlement(params.amount),
      },
    })
    .select(
      "id,inquiry_id,provider,order_id,transaction_id,status,amount,currency,country_code,checkout_url,response_payload,webhook_payload,paid_at,cancelled_at,refunded_at,failed_at,created_at,updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create WiPay payment record.");
  }

  return data as WiPayPaymentSummary;
}

export type WiPayPaymentTransitionResult = {
  payment: WiPayPaymentSummary;
  transitionApplied: boolean;
  paidClaimed: boolean;
  previousStatus: WiPayCanonicalPaymentStatus;
  currentStatus: WiPayCanonicalPaymentStatus;
};

function canApplyWiPayTransition(
  currentStatus: WiPayCanonicalPaymentStatus,
  targetStatus: WiPayCanonicalPaymentStatus,
  allowDirectRefund: boolean,
) {
  if (currentStatus === targetStatus) {
    return false;
  }

  if (targetStatus === "refunded" && allowDirectRefund) {
    return true;
  }

  if (currentStatus === "pending") {
    return ["initiated", "paid", "failed", "cancelled"].includes(targetStatus);
  }

  if (currentStatus === "initiated") {
    return ["paid", "failed", "cancelled"].includes(targetStatus);
  }

  if (currentStatus === "failed" || currentStatus === "cancelled") {
    return targetStatus === "paid";
  }

  if (currentStatus === "paid") {
    return targetStatus === "refunded";
  }

  return false;
}

function getCanonicalStoredWiPayStatus(status: string): WiPayCanonicalPaymentStatus {
  const canonicalStatus = normalizeStatus(status);

  if (!canonicalStatus) {
    throw new Error(`Unsupported stored WiPay payment status: ${status}`);
  }

  return canonicalStatus;
}

/**
 * Applies a provider/admin payment transition with a database compare-and-set.
 *
 * The update predicate includes the exact status that was read. If two
 * callbacks race, only one UPDATE can match; the loser reloads the winning
 * state and receives `paidClaimed: false`. Callers must gate all one-time paid
 * side effects (email and notifications) on that flag.
 */
export async function transitionWiPayPaymentByOrderId(params: {
  orderId: string;
  status: WiPayCanonicalPaymentStatus;
  transactionId?: string | null;
  checkoutUrl?: string | null;
  responsePayload?: Record<string, unknown> | null;
  webhookPayload?: Record<string, unknown> | null;
  knownPayment?: WiPayPaymentSummary | null;
  allowDirectRefund?: boolean;
}) {
  const admin = createSupabaseServiceRoleClient();
  let currentPayment = params.knownPayment ?? null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    currentPayment = currentPayment ?? (await getWiPayPaymentByOrderId(params.orderId));

    if (!currentPayment) {
      throw new Error("Unable to find the WiPay payment for this order.");
    }

    const previousStatus = getCanonicalStoredWiPayStatus(currentPayment.status);
    const transitionApplied = canApplyWiPayTransition(
      previousStatus,
      params.status,
      params.allowDirectRefund === true,
    );

    if (!transitionApplied) {
      return {
        payment: currentPayment,
        transitionApplied: false,
        paidClaimed: false,
        previousStatus,
        currentStatus: previousStatus,
      } satisfies WiPayPaymentTransitionResult;
    }

    const now = new Date().toISOString();
    const preserveSettledIdentifiers = previousStatus === "paid" || previousStatus === "refunded";
    const { data, error } = await admin
      .from("wipay_payments")
      .update({
        status: params.status,
        transaction_id: preserveSettledIdentifiers
          ? currentPayment.transaction_id
          : params.transactionId?.trim() || currentPayment.transaction_id,
        checkout_url:
          previousStatus === "pending" || previousStatus === "initiated"
            ? params.checkoutUrl?.trim() || currentPayment.checkout_url
            : currentPayment.checkout_url,
        response_payload: params.responsePayload
          ? {
              ...(currentPayment.response_payload ?? {}),
              ...params.responsePayload,
            }
          : currentPayment.response_payload,
        webhook_payload: params.webhookPayload
          ? {
              ...(currentPayment.webhook_payload ?? {}),
              ...params.webhookPayload,
            }
          : currentPayment.webhook_payload,
        paid_at: params.status === "paid" ? currentPayment.paid_at ?? now : currentPayment.paid_at,
        cancelled_at:
          params.status === "cancelled" ? currentPayment.cancelled_at ?? now : currentPayment.cancelled_at,
        refunded_at: params.status === "refunded" ? currentPayment.refunded_at ?? now : currentPayment.refunded_at,
        failed_at: params.status === "failed" ? currentPayment.failed_at ?? now : currentPayment.failed_at,
      })
      .eq("order_id", params.orderId)
      .eq("provider", "wipay")
      .eq("status", currentPayment.status)
      .select(
        "id,inquiry_id,provider,order_id,transaction_id,status,amount,currency,country_code,checkout_url,response_payload,webhook_payload,paid_at,cancelled_at,refunded_at,failed_at,created_at,updated_at",
      )
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      const payment = data as WiPayPaymentSummary;
      return {
        payment,
        transitionApplied: true,
        paidClaimed: params.status === "paid" && previousStatus !== "paid" && previousStatus !== "refunded",
        previousStatus,
        currentStatus: getCanonicalStoredWiPayStatus(payment.status),
      } satisfies WiPayPaymentTransitionResult;
    }

    // Another request won the compare-and-set. Reload and evaluate its state;
    // this caller must never inherit the winner's first-paid claim.
    currentPayment = null;
  }

  throw new Error("WiPay payment state changed too frequently. Please retry.");
}
