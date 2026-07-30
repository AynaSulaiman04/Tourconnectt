import Link from "next/link";
import type { NavbarVariant } from "@/components/navigation/nav-config";
import { BrandLogo } from "@/components/brand/BrandLogo";

type SiteFooterProps = {
  variant?: NavbarVariant;
};

export function SiteFooter({ variant = "public" }: SiteFooterProps) {
  const badge =
    variant === "admin"
      ? "Admin oversight"
      : variant === "operator"
        ? "Operator tools"
        : variant === "traveler"
          ? "Traveller portal"
          : "Travel discovery";

  const links =
    variant === "admin"
      ? [
          { href: "/AdminDashboard", label: "Dashboard" },
          { href: "/AdminBookings", label: "Bookings" },
          { href: "/AdminSettings", label: "Settings" },
        ]
      : variant === "operator"
        ? [
            { href: "/OperatorDashboard", label: "Overview" },
            { href: "/OperatorListings", label: "Listings" },
            { href: "/OperatorSettings", label: "Settings" },
          ]
        : variant === "traveler"
          ? [
              { href: "/TravellerProfile", label: "Profile" },
              { href: "/Enquiry", label: "Enquiry" },
              { href: "/ConciergeChat", label: "Concierge" },
            ]
          : [
              { href: "/LandingPage", label: "Home" },
              { href: "/Enquiry", label: "Enquiry" },
              { href: "/ConciergeChat", label: "Concierge" },
            ];

  return (
    <footer className="site-footer">
      <div className="page-shell-inner site-footer-inner">
        <div className="site-footer-brand">
          <BrandLogo href="/LandingPage" variant="footer" />
          <p className="site-footer-badge">{badge}</p>
          <p className="site-footer-copy">
            A premium tourism platform for travellers, operators, and administrators.
          </p>
        </div>
        <div className="site-footer-links">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
