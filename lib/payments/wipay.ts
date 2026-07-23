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
export type { WiPayPaymentSummary } from "@/lib/supabase/inquiry-types";

export const PLATFORM_ADMIN_COMMISSION_RATE = 0.2;
export const OPERATOR_PAYOUT_RATE = 0.8;

export type PaymentSettlementBreakdown = {
  grossAmount: number;
  adminCommissionAmount: number;
  operatorPayoutAmount: number;
  adminCommissionRate: number;
  operatorPayoutRate: number;
};

type WiPayCheckoutOptions = {
  inquiryId: string;
  orderId: string;
  amount: string;
  currency: string;
  countryCode: string;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
};

type WiPayHostedCheckoutOptions = {
  orderId: string;
  amount: string;
  currency: string;
  countryCode: string;
  responseUrl: string;
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

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function getWiPayApiBaseUrl() {
  return getOptionalEnv("WIPAY_API_BASE_URL", "https://tt.wipayfinancial.com/plugins/payments/request").replace(/\/+$/, "");
}

function getWiPayDeveloperId() {
  return getRequiredEnv("WIPAY_DEVELOPER_ID");
}

function getWiPayBusinessKey() {
  return getRequiredEnv("WIPAY_BUSINESS_KEY");
}

function getWiPayCurrency() {
  return getOptionalEnv("WIPAY_CURRENCY", "TTD").toUpperCase();
}

function getWiPayCountryCode() {
  return getOptionalEnv("WIPAY_COUNTRY_CODE", "TT").toUpperCase();
}

export function getWiPayConfigStatus() {
  const missingKeys = ["WIPAY_DEVELOPER_ID", "WIPAY_BUSINESS_KEY"].filter((key) => !process.env[key]?.trim());

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

function normalizeStatus(value: string | null | undefined): WiPayPaymentStatus {
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

  return "pending";
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
  return `wp${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 28)}`;
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

export function buildWiPayCheckoutPayload(options: WiPayCheckoutOptions) {
  return {
    developer_id: getWiPayDeveloperId(),
    business_key: getWiPayBusinessKey(),
    total: options.amount,
    currency: options.currency,
    country_code: options.countryCode,
    order_id: options.orderId,
    return_url: options.returnUrl,
    cancel_url: options.cancelUrl,
    webhook_url: options.webhookUrl,
  };
}

export async function createWiPayCheckoutSession(options: WiPayCheckoutOptions) {
  const response = await fetch(`${getWiPayApiBaseUrl()}/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(buildWiPayCheckoutPayload(options)),
    cache: "no-store",
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

  const checkoutUrl = data?.url ?? data?.checkout_url ?? null;

  if (!checkoutUrl || typeof checkoutUrl !== "string") {
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

export function buildWiPayHostedCheckoutPayload(options: WiPayHostedCheckoutOptions) {
  return {
    account_number: getWiPayDeveloperId(),
    country_code: options.countryCode,
    currency: options.currency,
    environment: getOptionalEnv("WIPAY_ENVIRONMENT", "sandbox"),
    fee_structure: "customer_pay",
    method: "credit_card",
    order_id: options.orderId,
    origin: "TT-Connect",
    cancel_url: options.responseUrl,
    response_url: options.responseUrl,
    total: options.amount,
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
  const response = await fetch(getWiPayApiBaseUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(buildWiPayHostedCheckoutPayload(options)),
    cache: "no-store",
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

export function verifyWiPayWebhookSignature(payload: Record<string, unknown>, signatureHeader: string | null) {
  const businessKey = getWiPayBusinessKey();

  if (!signatureHeader) {
    return false;
  }

  const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
  const amount = typeof payload.amount === "string" || typeof payload.amount === "number" ? String(payload.amount) : "";
  const status = typeof payload.status === "string" ? payload.status : "";
  const verificationString = `${orderId}${amount}${status}${businessKey}`;
  const expectedSignature = crypto.createHash("sha256").update(verificationString).digest("hex");

  const signatureBuffer = Buffer.from(signatureHeader.trim().toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

export function verifyWiPayCallbackHash(payload: WiPayCallbackPayload, hashValue: string | null) {
  if (!hashValue) {
    return false;
  }

  const amount = payload.total ?? "";
  const verificationString = `${payload.order_id}${amount}${payload.status}${getWiPayBusinessKey()}`;
  const expectedHash = crypto.createHash("sha256").update(verificationString).digest("hex");

  return expectedHash === hashValue.trim().toLowerCase();
}

export function normalizeWiPayCallbackStatus(value: string | null | undefined): WiPayPaymentStatus {
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

export async function updateWiPayPaymentByOrderId(
  orderId: string,
  fields: Partial<{
    transaction_id: string | null;
    status: WiPayPaymentStatus;
    checkout_url: string | null;
    response_payload: Record<string, unknown> | null;
    webhook_payload: Record<string, unknown> | null;
    paid_at: string | null;
    cancelled_at: string | null;
    refunded_at: string | null;
    failed_at: string | null;
  }>,
) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("wipay_payments")
    .update(fields)
    .eq("order_id", orderId)
    .eq("provider", "wipay");

  if (error) {
    throw new Error(error.message);
  }
}
