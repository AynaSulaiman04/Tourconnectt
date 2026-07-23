import { NextRequest, NextResponse } from "next/server";
import { PORTAL_AUTH_COOKIE_NAME, serializePortalAuthCookie } from "@/lib/supabase/portal-auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { id?: string; email?: string; full_name?: string; role?: "traveler" | "operator" | "admin" }
    | null;

  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.email !== "string" ||
    typeof body.full_name !== "string" ||
    !["traveler", "operator", "admin"].includes(String(body.role))
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    PORTAL_AUTH_COOKIE_NAME,
    serializePortalAuthCookie({
      id: body.id,
      email: body.email,
      full_name: body.full_name,
      role: body.role as "traveler" | "operator" | "admin",
    }),
    {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  );

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PORTAL_AUTH_COOKIE_NAME, "", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
