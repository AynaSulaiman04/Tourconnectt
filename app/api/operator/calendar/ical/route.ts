import { NextRequest, NextResponse } from "next/server";
import { getOptionalCurrentUserProfile } from "@/lib/supabase/profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { formatIcalDateTime, serializeIcalFeed, verifyIcalFeedToken } from "@/lib/calendar/ical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListingRow = {
  id: string;
  title: string;
  location: string;
  operator_name: string;
};

type InquiryRow = {
  id: string;
  listing_id: string | null;
  traveler_name: string;
  traveler_email: string;
  traveler_phone: string | null;
  destination: string;
  destination_country: string;
  operator_name: string;
  operator_id: string | null;
  preferred_start_date: string | null;
  preferred_end_date: string | null;
  notes: string | null;
  status: "submitted" | "reviewed" | "confirmed" | "closed";
  ical_uid?: string | null;
  created_at: string;
};

function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!appUrl) {
    return "http://localhost:3000";
  }

  return appUrl.replace(/\/+$/, "");
}

function buildStableUid(inquiry: InquiryRow) {
  const hostname = new URL(getAppUrl()).hostname;
  return inquiry.ical_uid ?? `ttconnect-${inquiry.id}@${hostname}`;
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(error && (error.code === "42703" || error.message?.includes("column") || error.message?.includes("does not exist")));
}

async function fetchOperatorBookings(admin: ReturnType<typeof createSupabaseServiceRoleClient>, operatorId: string, operatorName: string | null) {
  const columns =
    "id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,notes,status,ical_uid,created_at";
  const reducedColumns =
    "id,listing_id,traveler_name,traveler_email,traveler_phone,destination,destination_country,operator_name,operator_id,preferred_start_date,preferred_end_date,notes,status,created_at";
  type InquiryQueryResult = {
    data: Array<Record<string, unknown>> | null;
    error: { code?: string | null; message: string } | null;
  };

  const queryByOperatorId = () =>
    admin
      .from("inquiries")
      .select(columns)
      .eq("operator_id", operatorId)
      .eq("status", "confirmed")
      .not("preferred_start_date", "is", null)
      .order("preferred_start_date", { ascending: true })
      .order("created_at", { ascending: false });

  const queryByOperatorName = () =>
    admin
      .from("inquiries")
      .select(columns)
      .eq("operator_name", operatorName ?? "")
      .eq("status", "confirmed")
      .not("preferred_start_date", "is", null)
      .order("preferred_start_date", { ascending: true })
      .order("created_at", { ascending: false });

  let result = (await queryByOperatorId()) as InquiryQueryResult;

  if (result.error && isMissingColumnError(result.error)) {
    result = (await admin
      .from("inquiries")
      .select(reducedColumns)
      .eq("operator_id", operatorId)
      .eq("status", "confirmed")
      .not("preferred_start_date", "is", null)
      .order("preferred_start_date", { ascending: true })
      .order("created_at", { ascending: false })) as InquiryQueryResult;
  }

  if ((!result.data || result.data.length === 0) && operatorName) {
    const fallback = await queryByOperatorName();
    if (fallback.error && isMissingColumnError(fallback.error)) {
      const reducedFallback = (await admin
        .from("inquiries")
        .select(reducedColumns)
        .eq("operator_name", operatorName)
        .eq("status", "confirmed")
        .not("preferred_start_date", "is", null)
        .order("preferred_start_date", { ascending: true })
        .order("created_at", { ascending: false })) as InquiryQueryResult;

      if (!reducedFallback.error && reducedFallback.data && reducedFallback.data.length > 0) {
        result = reducedFallback;
      } else if (!result.data) {
        result = reducedFallback;
      }
    } else if (!fallback.error && fallback.data && fallback.data.length > 0) {
      result = fallback;
    } else if (!result.data) {
      result = fallback;
    }
  }

  return result;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() ?? null;
    let operatorId: string | null = null;

    if (token) {
      operatorId = verifyIcalFeedToken(token);

      if (!operatorId) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    } else {
      const profileContext = await getOptionalCurrentUserProfile();

      if (!profileContext?.profile || profileContext.profile.role !== "operator") {
        return new NextResponse("Forbidden", { status: 403 });
      }

      operatorId = profileContext.profile.id;
    }

    const admin = createSupabaseServiceRoleClient();

    const { data: profileData, error: profileError } = await admin
      .from("profiles")
      .select("id,email,full_name,role")
      .eq("id", operatorId)
      .maybeSingle();

    if (profileError || !profileData || profileData.role !== "operator") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const inquiriesResult = await fetchOperatorBookings(admin, operatorId, profileData.full_name ?? null);

    const { data: inquiriesData, error: inquiriesError } = inquiriesResult;

    if (inquiriesError) {
      return new NextResponse(inquiriesError.message, { status: 500 });
    }

    const inquiries = (inquiriesData ?? []) as unknown as InquiryRow[];
    const listingIds = [...new Set(inquiries.map((item) => item.listing_id).filter((value): value is string => Boolean(value)))];

    let listingsById = new Map<string, ListingRow>();

    if (listingIds.length) {
      const { data: listingsData, error: listingsError } = await admin
        .from("tour_listings")
        .select("id,title,location,operator_name")
        .in("id", listingIds);

      if (!listingsError && listingsData) {
        listingsById = new Map((listingsData as ListingRow[]).map((listing) => [listing.id, listing]));
      }
    }

    const appUrl = getAppUrl();
    const dtstamp = formatIcalDateTime(new Date());

    const events = inquiries.map((inquiry) => {
      const listing = inquiry.listing_id ? listingsById.get(inquiry.listing_id) ?? null : null;
      const startDate = inquiry.preferred_start_date ?? inquiry.created_at.slice(0, 10);
      const endDate = inquiry.preferred_end_date ?? startDate;
      const safeEndDate = endDate > startDate ? endDate : (() => {
        const nextDay = new Date(`${startDate}T00:00:00.000Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        return nextDay.toISOString().slice(0, 10);
      })();

      const description = [
        `Traveler: ${inquiry.traveler_name}`,
        `Email: ${inquiry.traveler_email}`,
        inquiry.traveler_phone ? `Phone: ${inquiry.traveler_phone}` : null,
        `Experience: ${listing?.title ?? inquiry.destination}`,
        `Operator: ${inquiry.operator_name}`,
        inquiry.notes ? `Notes: ${inquiry.notes}` : null,
        `TT Connect: ${appUrl}`,
      ]
        .filter(Boolean)
        .join("\n");

      return {
        uid: buildStableUid(inquiry),
        dtstamp,
        startDate,
        endDate: safeEndDate,
        summary: `${listing?.title ?? inquiry.destination} - ${inquiry.traveler_name}`,
        description,
        location: listing?.location ?? inquiry.destination,
      };
    });

    const response = new NextResponse(serializeIcalFeed(events), {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=300, must-revalidate",
        "Content-Disposition": `inline; filename="${profileData.full_name?.trim().replace(/\s+/g, "-").toLowerCase() || "operator"}-bookings.ics"`,
      },
    });

    return response;
  } catch (error) {
    console.error("Operator iCal feed error", error);
    return new NextResponse(
      "Unable to generate operator calendar feed.",
      { status: 500 },
    );
  }
}
