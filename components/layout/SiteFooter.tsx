import Image from "next/image";
import Link from "next/link";
import type { NavbarVariant } from "@/components/navigation/nav-config";

type SiteFooterProps = {
  variant?: NavbarVariant;
};

export function SiteFooter({ variant = "public" }: SiteFooterProps) {
  const badge =
    variant === "admin"
      ? "Admin oversight"
      : variant === "operator"
        ? "Operator tools"
        : "Travel discovery";

  return (
    <footer className="border-t border-outline-variant/10 bg-surface-container-lowest/80 backdrop-blur-sm">
      <div className="page-shell-inner px-margin-mobile md:px-margin-desktop py-section-gap flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <Link href="/" aria-label="Tour ConnecTT home" className="inline-flex">
            <Image
              alt="Tour ConnecTT"
              className="footer-brand-logo"
              height={180}
              src="/branding/tourconnecttt-logo.png"
              width={620}
            />
          </Link>
          <p className="text-xs uppercase tracking-[0.28em] text-secondary font-semibold">{badge}</p>
          <p className="max-w-xl text-sm leading-7 text-on-surface-variant">
            A premium tourism platform for travelers, operators, and administrators.
          </p>
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-on-surface-variant">
          <Link className="hover:text-on-surface" href="/LandingPage">
            Home
          </Link>
          <Link className="hover:text-on-surface" href="/Inquiry">
            Inquiry
          </Link>
          <Link className="hover:text-on-surface" href="/ConciergeChat">
            Concierge
          </Link>
          <Link className="hover:text-on-surface" href="/TravellerProfile">
            Profile
          </Link>
        </div>
      </div>
    </footer>
  );
}
