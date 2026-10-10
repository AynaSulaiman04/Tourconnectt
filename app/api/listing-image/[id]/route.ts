import { NextRequest } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("tour_listings")
    .select("image_base64")
    .eq("id", id)
    .eq("status", "live")
    .eq("is_active", true)
    .maybeSingle();

  const match = !error && typeof data?.image_base64 === "string" ? DATA_URL_PATTERN.exec(data.image_base64) : null;

  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
