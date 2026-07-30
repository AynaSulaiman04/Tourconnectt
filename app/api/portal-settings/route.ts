import { NextResponse } from "next/server";
import { getSiteContent } from "@/lib/site-content";
import { getPortalSettingsFromContent } from "@/lib/portal-settings";

export async function GET() {
  const content = await getSiteContent();
  const settings = getPortalSettingsFromContent(content);

  return NextResponse.json(settings, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
