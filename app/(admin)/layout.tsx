import type { ReactNode } from "react";
import { SidebarNav } from "@/components/navigation/SidebarNav";
import { requireAdminProfile } from "@/lib/supabase/admin";
import "@/components/navigation/portal-sidebar.css";
import "./admin-shell.css";

/**
 * Chrome for every authenticated admin page.
 *
 * This exists as a layout rather than a per-page `<PageShell>` so the sidebar
 * is mounted once and *stays* mounted: moving between Overview, Analytics,
 * Bookings and the rest swaps only the page body, instead of tearing down and
 * rebuilding the whole shell on each navigation.
 *
 * `(admin)` is a route group, so it does not appear in any URL --
 * /AdminDashboard and friends are unchanged. AdminLogin and AdminSignUp sit
 * outside the group deliberately: they must not render portal chrome.
 *
 * No footer here. The public marketing footer has no place in a workspace, and
 * it pushed a second scroll region onto every admin screen.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Memoised, so the pages below can call this again without a second round trip.
  const profile = await requireAdminProfile();

  return (
    <div className="page-shell page-shell-portal admin-shell">
      <div className="grain-overlay" />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <SidebarNav
        authResolved
        travelerProfile={{
          id: profile.id,
          full_name: profile.full_name,
          profile_image_url: profile.profile_image_url,
          role: "admin",
        }}
        variant="admin"
      />

      <div className="page-shell-portal-main">
        <div className="page-shell-inner portal-shell-content" id="main-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
