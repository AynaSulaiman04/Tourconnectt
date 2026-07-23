import { NextRequest, NextResponse } from "next/server";
import { getAdminWorkspaceData } from "@/lib/supabase/admin";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { recordAdminNotifications } from "@/lib/supabase/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const returnTo = String(formData.get("return_to") ?? "").trim() || "/AdminDashboard";
    const profileContext = await getOptionalCurrentUserProfile();

    if (!profileContext?.profile) {
      return NextResponse.redirect(new URL("/AdminLogin?redirect=/AdminDashboard", request.url), 303);
    }

    if (profileContext.profile.role !== "admin") {
      return NextResponse.redirect(new URL(getRoleDashboardRoute(profileContext.profile.role), request.url), 303);
    }

    const dashboard = await getAdminWorkspaceData();
    const balance = dashboard.stats.adminCommissionTotal;

    if (balance <= 0) {
      return NextResponse.redirect(new URL(`${returnTo}?withdrawal_error=no_balance`, request.url), 303);
    }

    await recordAdminNotifications({
      actorProfileId: dashboard.profile.id,
      excludeProfileId: dashboard.profile.id,
      kind: "withdrawal_request",
      title: "Admin withdrawal requested",
      body: `${dashboard.profile.full_name} requested a withdrawal for ${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "TTD",
        maximumFractionDigits: 0,
      }).format(balance)} from the 20% platform commission balance.`,
      href: "/AdminBookings?tab=payments&paymentStatus=paid",
      entityType: "admin_withdrawal",
      entityId: dashboard.profile.id,
      metadata: {
        balance,
        grossCollections: dashboard.stats.monthlyRevenue,
        operatorPayoutTotal: dashboard.stats.operatorPayoutTotal,
        paymentCount: dashboard.stats.paymentCount,
      },
    });

    return NextResponse.redirect(new URL(`${returnTo}?withdrawal=requested`, request.url), 303);
  } catch (error) {
    console.error("Admin withdrawal request failed", error);

    return NextResponse.redirect(new URL("/AdminDashboard?withdrawal_error=request_failed", request.url), 303);
  }
}
