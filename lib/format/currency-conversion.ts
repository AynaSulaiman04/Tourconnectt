const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  IN: "INR",
  JP: "JPY",
  CN: "CNY",
  HK: "HKD",
  SG: "SGD",
  AE: "AED",
  SA: "SAR",
  BR: "BRL",
  MX: "MXN",
  ZA: "ZAR",
  CH: "CHF",
  NO: "NOK",
  SE: "SEK",
  DK: "DKK",
  // Eurozone
  AT: "EUR",
  BE: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
  // Trinidad & Tobago and nearby — keep TTD
  TT: "TTD",
  BB: "TTD",
  GY: "TTD",
  JM: "TTD",
};

export function currencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return "TTD";
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? "TTD";
}

const RATE_CACHE_MS = 60 * 60 * 1000; // 1 hour
let cachedRates: { fetchedAt: number; rates: Record<string, number> } | null = null;
let inFlight: Promise<Record<string, number>> | null = null;

async function fetchTtdRates(): Promise<Record<string, number>> {
  const url = "https://api.exchangerate.host/latest?base=TTD";
  const response = await fetch(url, {
    next: { revalidate: 3600 },
  } as RequestInit);
  if (!response.ok) throw new Error(`Rate fetch failed: ${response.status}`);
  const payload = (await response.json()) as { rates?: Record<string, number> };
  if (!payload.rates || typeof payload.rates !== "object") {
    throw new Error("Rate payload missing rates map");
  }
  return payload.rates;
}

export async function getTtdRate(targetCurrency: string): Promise<number | null> {
  const target = targetCurrency.toUpperCase();
  if (target === "TTD") return 1;

  const now = Date.now();
  if (cachedRates && now - cachedRates.fetchedAt < RATE_CACHE_MS) {
    return cachedRates.rates[target] ?? null;
  }

  if (!inFlight) {
    inFlight = fetchTtdRates()
      .then((rates) => {
        cachedRates = { fetchedAt: Date.now(), rates };
        return rates;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  try {
    const rates = await inFlight;
    return rates[target] ?? null;
  } catch {
    return null;
  }
}
