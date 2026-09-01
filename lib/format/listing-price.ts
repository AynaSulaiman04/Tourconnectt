const CURRENCY_TOKEN_PATTERN = /\b(TTD|USD)\b\.?|TT\$|US\$|\$/gi;

function getFormatter(locale: string, withCents: boolean) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "TTD",
    currencyDisplay: "symbol",
    ...(withCents ? {} : { maximumFractionDigits: 0 }),
  });
}

function formatAmount(value: number, locale: string) {
  const withCents = value % 1 !== 0;
  const formatted = getFormatter(locale, withCents).format(value);
  return formatted.startsWith("TT") ? formatted : `TT${formatted}`;
}

export function formatListingPrice(
  price: string | null | undefined,
  locale: string = "en-TT",
): string | null {
  if (!price) return null;

  const stripped = price.replace(CURRENCY_TOKEN_PATTERN, "").replace(/\s+/g, " ").trim();
  if (!stripped) return null;

  const singleAmount = stripped.match(/^(\d+(?:[.,]\d+)?)$/);
  if (singleAmount) {
    const value = Number(singleAmount[1].replace(",", "."));
    if (Number.isFinite(value)) {
      return formatAmount(value, locale);
    }
  }

  const rangeMatch = stripped.match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)(.*)$/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1].replace(",", "."));
    const high = Number(rangeMatch[2].replace(",", "."));
    const suffix = rangeMatch[3].trim();
    if (Number.isFinite(low) && Number.isFinite(high)) {
      const formatted = `${formatAmount(low, locale)} – ${formatAmount(high, locale)}`;
      return suffix ? `${formatted} ${suffix}` : formatted;
    }
  }

  const leadingNumberMatch = stripped.match(/^(\d+(?:[.,]\d+)?)(\s+.+)$/);
  if (leadingNumberMatch) {
    const value = Number(leadingNumberMatch[1].replace(",", "."));
    if (Number.isFinite(value)) {
      return `${formatAmount(value, locale)}${leadingNumberMatch[2]}`;
    }
  }

  return stripped;
}
