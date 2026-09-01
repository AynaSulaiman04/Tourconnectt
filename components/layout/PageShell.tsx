import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MainNavbar } from "@/components/navigation/MainNavbar";
import { SidebarNav } from "@/components/navigation/SidebarNav";
import type { NavbarVariant } from "@/components/navigation/nav-config";
import "@/components/navigation/portal-sidebar.css";

type PageShellProps = {
  children: ReactNode;
  variant?: NavbarVariant;
  className?: string;
  contentClassName?: string;
  showFooter?: boolean;
  authResolved?: boolean;
  travelerProfile?: {
    id?: string;
    full_name: string;
    profile_image_url: string | null;
    role?: "traveler" | "operator" | "admin";
  } | null;
};

export function PageShell({
  children,
  variant = "public",
  className = "",
  contentClassName = "",
  showFooter,
  authResolved = false,
  travelerProfile = null,
}: PageShellProps) {
  const isPortal = variant !== "public";
  const useSidebar = variant === "admin" || variant === "operator" || variant === "traveler";
  const isFullBleed = contentClassName.includes("full-bleed") || contentClassName.includes("concierge-page-shell");
  const resolvedContentClassName = [
    isPortal && !isFullBleed ? "portal-shell-content" : "",
    contentClassName,
  ]
    .filter(Boolean)
    .join(" ");
  const shouldShowFooter = showFooter ?? !isFullBleed;

  const shellClass = [
    "page-shell",
    useSidebar ? "page-shell-portal" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <div className="grain-overlay" />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {useSidebar ? (
        <SidebarNav
          authResolved={authResolved}
          travelerProfile={travelerProfile}
          variant={variant as "admin" | "operator" | "traveler"}
        />
      ) : (
        <MainNavbar authResolved={authResolved} travelerProfile={travelerProfile} variant={variant} />
      )}
      <div
        className={`page-shell-inner ${resolvedContentClassName}`.trim()}
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </div>
      {shouldShowFooter ? <SiteFooter variant={variant} /> : null}
    </div>
  );
}
