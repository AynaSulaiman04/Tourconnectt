import type { ReactNode } from "react";
import { MainNavbar } from "@/components/navigation/MainNavbar";
import type { NavbarVariant } from "@/components/navigation/nav-config";

type PageShellProps = {
  children: ReactNode;
  variant?: NavbarVariant;
  className?: string;
  contentClassName?: string;
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
  travelerProfile = null,
}: PageShellProps) {
  return (
    <div className={`page-shell ${className}`.trim()}>
      <div className="grain-overlay" />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <MainNavbar travelerProfile={travelerProfile} variant={variant} />
      <div
        className={`page-shell-inner ${contentClassName}`.trim()}
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
