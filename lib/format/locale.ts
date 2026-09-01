import { headers } from "next/headers";

export async function getRequestLocale(): Promise<string> {
  try {
    const headerList = await headers();
    const acceptLanguage = headerList.get("accept-language");
    if (!acceptLanguage) return "en-TT";
    const first = acceptLanguage.split(",")[0]?.trim();
    if (!first) return "en-TT";
    return first.split(";")[0] || "en-TT";
  } catch {
    return "en-TT";
  }
}
