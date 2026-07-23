import { NextRequest, NextResponse } from "next/server";
import { getOperatorDashboardData } from "@/lib/supabase/operator-dashboard";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { recordAdminNotifications } from "@/lib/supabase/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildRedirectUrl(request: NextRequest, search: string) {
  return new URL(`/OperatorDashboard${search}`, request.url);
}

export async function POST(request: NextRequest) {
  try {
    const profileContext = await getOptionalCurrentUserProfile();

    if (!profileContext?.profile) {
      return NextResponse.redirect(new URL("/LoginPage?redirect=/OperatorDashboard", request.url), 303);
    }

    if (profileContext.profile.role !== "operator") {
      return NextResponse.redirect(new URL(getRoleDashboardRoute(profileContext.profile.role), request.url), 303);
    }

    const dashboard = await getOperatorDashboardData();
    const balance = dashboard.operatorPayoutBalance;

    if (balance <= 0) {
      return NextResponse.redirect(buildRedirectUrl(request, "?withdrawal_error=no_balance"), 303);
    }

    await recordAdminNotifications({
      actorProfileId: dashboard.profile.id,
      kind: "withdrawal_request",
      title: "Operator withdrawal requested",
      body: `${dashboard.profile.full_name} requested a withdrawal for ${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "TTD",
        maximumFractionDigits: 0,
      }).format(balance)} from the 80% operator payout balance.`,
      href: "/AdminBookings?tab=payments&paymentStatus=paid",
      entityType: "operator_withdrawal",
      entityId: dashboard.profile.id,
      metadata: {
        balance,
        grossCollections: dashboard.estimatedRevenue,
        platformCommissionTotal: dashboard.platformCommissionTotal,
        paymentCount: dashboard.paymentCount,
      },
    });

    return NextResponse.redirect(buildRedirectUrl(request, "?withdrawal=requested"), 303);
  } catch (error) {
    console.error("Operator withdrawal request failed", error);

    return NextResponse.redirect(buildRedirectUrl(request, "?withdrawal_error=request_failed"), 303);
  }
}
