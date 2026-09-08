import { formatListingPrice } from "./listing-price";
import { parsePriceBasis, parsePriceCurrency, priceBasisLabel } from "@/lib/listing-taxonomy";

export type ListingPriceLabel = {
  /** The operator's own price, in the operator's own currency: "TT$1,650". */
  amount: string;
  /** "per person" / "per group" / "total", or null when the operator has not said. */
  basis: string | null;
  /** A reference conversion for overseas visitors: "≈ US$243". Never the headline. */
  approx: string | null;
};

type Options = {
  price: string | null | undefined;
  currency?: string | null;
  basis?: string | null;
  locale?: string;
  /** The viewer's local currency, from request geo. */
  targetCurrency?: string | null;
  /** TTD -> targetCurrency rate. */
  ttdRate?: number | null;
};

/**
 * Prices used to be silently converted into the viewer's currency, with a note
 * above the grid explaining that bookings are actually billed in TTD. The
 * headline figure and the currency it was quoted in therefore lived in two
 * different places. This keeps the operator's own price and currency together
 * on the card, states the basis, and demotes any conversion to a reference line.
 */
export function formatListingPriceLabel(options: Options): ListingPriceLabel | null {
  const currency = parsePriceCurrency(options.currency) ?? "TTD";
  const locale = options.locale ?? "en-TT";

  // formatListingPrice reads the stored figure as TTD. When the operator quoted
  // in USD, format it in place rather than converting it as though it were TTD.
  const amount =
    currency === "USD"
      ? formatListingPrice(options.price, { locale, targetCurrency: "USD", ttdRate: 1 })
      : formatListingPrice(options.price, { locale });

  if (!amount) {
    return null;
  }

  const basis = parsePriceBasis(options.basis) ? priceBasisLabel(options.basis) : null;

  const target = options.targetCurrency?.toUpperCase() ?? null;
  const rate = options.ttdRate ?? null;
  const approx =
    currency === "TTD" && target && target !== "TTD" && rate && rate > 0
      ? formatListingPrice(options.price, { locale, targetCurrency: target, ttdRate: rate })
      : null;

  return {
    amount,
    basis,
    // A conversion identical to the headline is noise.
    approx: approx && approx !== amount ? approx : null,
  };
}
