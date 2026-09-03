const CURRENCY_TOKEN_PATTERN = /\b(TTD|USD)\b\.?|TT\$|US\$|\$/gi;

/** A number that may carry thousands groups and/or a decimal part: 1,650 · 1.650,50 · 12.50 */
const NUMBER = String.raw`\d[\d.,]*`;

/**
 * Operators enter prices as free text, so "1,650" reaches us with the comma as
 * a thousands separator. Treating every comma as a decimal point turned
 * "TTD 1,650" into TT$1.65.
 *
 * When both separators appear, the last one is the decimal point. When only
 * commas appear, groups of exactly three digits are thousands separators;
 * anything else is read as a decimal comma.
 */
function parseAmount(raw: string) {
  const value = raw.trim();
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    return Number(
      lastComma > lastDot
        ? value.replace(/\./g, "").replace(",", ".")
        : value.replace(/,/g, ""),
    );
  }

  if (lastComma >= 0) {
    return Number(
      /^\d{1,3}(,\d{3})+$/.test(value) ? value.replace(/,/g, "") : value.replace(",", "."),
    );
  }

  // A lone dot in groups of three is also a thousands separator: 1.650
  if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    return Number(value.replace(/\./g, ""));
  }

  return Number(value);
}

type FormatOptions = {
  locale?: string;
  targetCurrency?: string;
  ttdRate?: number | null;
};

function makeFormatter(locale: string, currency: string, withCents: boolean) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    ...(withCents ? {} : { maximumFractionDigits: 0 }),
  });
}

function formatTtdAmount(value: number, locale: string) {
  const withCents = value % 1 !== 0;
  const formatted = makeFormatter(locale, "TTD", withCents).format(value);
  return formatted.startsWith("TT") ? formatted : `TT${formatted}`;
}

function formatConvertedAmount(
  value: number,
  locale: string,
  currency: string,
  rate: number,
) {
  const converted = value * rate;
  const withCents = converted < 100 || converted % 1 >= 0.05;
  return makeFormatter(locale, currency, withCents).format(converted);
}

function formatAmount(value: number, opts: FormatOptions) {
  const locale = opts.locale ?? "en-TT";
  const target = opts.targetCurrency?.toUpperCase();
  if (target && target !== "TTD" && opts.ttdRate && opts.ttdRate > 0) {
    return formatConvertedAmount(value, locale, target, opts.ttdRate);
  }
  return formatTtdAmount(value, locale);
}

export function formatListingPrice(
  price: string | null | undefined,
  localeOrOptions: string | FormatOptions = "en-TT",
): string | null {
  if (!price) return null;

  const opts: FormatOptions =
    typeof localeOrOptions === "string" ? { locale: localeOrOptions } : localeOrOptions;

  const stripped = price.replace(CURRENCY_TOKEN_PATTERN, "").replace(/\s+/g, " ").trim();
  if (!stripped) return null;

  const singleAmount = stripped.match(new RegExp(`^(${NUMBER})$`));
  if (singleAmount) {
    const value = parseAmount(singleAmount[1]);
    if (Number.isFinite(value)) {
      return formatAmount(value, opts);
    }
  }

  const rangeMatch = stripped.match(new RegExp(`^(${NUMBER})\\s*[-–—]\\s*(${NUMBER})(.*)$`));
  if (rangeMatch) {
    const low = parseAmount(rangeMatch[1]);
    const high = parseAmount(rangeMatch[2]);
    const suffix = rangeMatch[3].trim();
    if (Number.isFinite(low) && Number.isFinite(high)) {
      const formatted = `${formatAmount(low, opts)} – ${formatAmount(high, opts)}`;
      return suffix ? `${formatted} ${suffix}` : formatted;
    }
  }

  const leadingNumberMatch = stripped.match(new RegExp(`^(${NUMBER}?)(\\s+.+)$`));
  if (leadingNumberMatch) {
    const value = parseAmount(leadingNumberMatch[1]);
    if (Number.isFinite(value)) {
      return `${formatAmount(value, opts)}${leadingNumberMatch[2]}`;
    }
  }

  return stripped;
}
