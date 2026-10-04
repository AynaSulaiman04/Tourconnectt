import Link from "next/link";
import type { NavbarVariant } from "@/components/navigation/nav-config";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NewsletterForm } from "@/components/layout/NewsletterForm";
import { getSiteContent } from "@/lib/site-content";
import "./site-footer.css";

type SiteFooterProps = {
  variant?: NavbarVariant;
};

const PLATFORM_LINKS = [
  { href: "/HowItWorks", label: "How it works" },
  { href: "/Enquiry", label: "Live listings" },
  { href: "/ConciergeChat", label: "Concierge" },
];

const COMPANY_LINKS = [
  { href: "/AboutUs", label: "About us" },
  { href: "/Partners", label: "Our partners" },
  { href: "/Careers", label: "Careers" },
];

// Public profiles the footer icons link out to. The X account was a dead
// placeholder pointing at x.com's homepage, so it is no longer listed.
const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/tourconnectt/",
    // Instagram glyph: rounded square, lens, and flash dot.
    path: "M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm4.5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.3-2.9a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/tourconnectt/",
    path: "M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z",
  },
];

const SUPPORT_LINKS = [
  { href: "/HelpCenter", label: "Help centre" },
  { href: "/TermsOfService", label: "Terms of service" },
  { href: "/PrivacyPolicy", label: "Privacy policy" },
  { href: "/ContactUs", label: "Contact us" },
];

export async function SiteFooter({ variant = "public" }: SiteFooterProps) {
  const siteContent = await getSiteContent();
  const description = siteContent.footerDescription;

  return (
    <footer className="site-footer" data-variant={variant}>
      <div className="site-footer-main">
        <div className="site-footer-brand">
          <BrandLogo
            className="site-footer-logo-image"
            href="/LandingPage"
            linkClassName="site-footer-logo"
            variant="footer"
          />
          <p className="site-footer-description">{description}</p>
        </div>

        <div className="site-footer-column">
          <h3>Platform</h3>
          {PLATFORM_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="site-footer-column">
          <h3>Company</h3>
          {COMPANY_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="site-footer-column">
          <h3>Support</h3>
          {SUPPORT_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="site-footer-column">
          <h3>Stay inspired</h3>
          <p>{description}</p>
          <NewsletterForm />
        </div>
      </div>

      <div className="site-footer-bottom">
        <p>&copy; 2026 TourConnecTT. All rights reserved.</p>

        <div className="site-footer-bottom-links">
          <Link href="/PrivacyPolicy">Privacy</Link>
          <Link href="/TermsOfService">Terms</Link>
          <div className="site-footer-socials" aria-label="Social links">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={social.label}
                title={social.label}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
