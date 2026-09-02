const CURRENCY_TOKEN_PATTERN = /\b(TTD|USD)\b\.?|TT\$|US\$|\$/gi;

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

  const singleAmount = stripped.match(/^(\d+(?:[.,]\d+)?)$/);
  if (singleAmount) {
    const value = Number(singleAmount[1].replace(",", "."));
    if (Number.isFinite(value)) {
      return formatAmount(value, opts);
    }
  }

  const rangeMatch = stripped.match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)(.*)$/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1].replace(",", "."));
    const high = Number(rangeMatch[2].replace(",", "."));
    const suffix = rangeMatch[3].trim();
    if (Number.isFinite(low) && Number.isFinite(high)) {
      const formatted = `${formatAmount(low, opts)} – ${formatAmount(high, opts)}`;
      return suffix ? `${formatted} ${suffix}` : formatted;
    }
  }

  const leadingNumberMatch = stripped.match(/^(\d+(?:[.,]\d+)?)(\s+.+)$/);
  if (leadingNumberMatch) {
    const value = Number(leadingNumberMatch[1].replace(",", "."));
    if (Number.isFinite(value)) {
      return `${formatAmount(value, opts)}${leadingNumberMatch[2]}`;
    }
  }

  return stripped;
}
