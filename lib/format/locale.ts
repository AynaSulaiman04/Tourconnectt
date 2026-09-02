import { headers } from "next/headers";

export type RequestGeo = {
  locale: string;
  country: string | null;
};

export async function getRequestLocale(): Promise<string> {
  const geo = await getRequestGeo();
  return geo.locale;
}

export async function getRequestGeo(): Promise<RequestGeo> {
  try {
    const headerList = await headers();
    const acceptLanguage = headerList.get("accept-language");
    let locale = "en-TT";
    if (acceptLanguage) {
      const first = acceptLanguage.split(",")[0]?.trim();
      if (first) locale = first.split(";")[0] || "en-TT";
    }
    const country =
      headerList.get("x-vercel-ip-country") ??
      headerList.get("cf-ipcountry") ??
      headerList.get("x-country") ??
      null;
    return { locale, country: country ? country.toUpperCase() : null };
  } catch {
    return { locale: "en-TT", country: null };
  }
}
