import { currencyForCountry, getTtdRate } from "./currency-conversion";

/**
 * The currency a listing's price is *also* shown in, beneath the operator's own.
 *
 * Overseas visitors get their own currency. Everyone else gets US dollars,
 * including visitors in Trinidad and Tobago: most travellers booking a trip
 * think in USD, and a price with no second reference reads as opaque to them.
 *
 * This never changes what is charged. WiPay is billed the operator's TTD figure
 * regardless of what is displayed -- see lib/payments/wipay.ts.
 */
export const FALLBACK_DISPLAY_CURRENCY = "USD";

export type DisplayCurrency = {
  /** The currency the reference line is rendered in. */
  currency: string;
  /** TTD -> currency rate, or null when the lookup failed. */
  rate: number | null;
};

export async function resolveDisplayCurrency(
  country: string | null | undefined,
): Promise<DisplayCurrency> {
  const local = currencyForCountry(country);
  const currency = local === "TTD" ? FALLBACK_DISPLAY_CURRENCY : local;

  // A failed rate lookup simply means no reference line; the headline price is
  // unaffected, so this must never throw.
  const rate = await getTtdRate(currency).catch(() => null);

  return { currency, rate };
}
