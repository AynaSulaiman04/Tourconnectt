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
    href: "https://www.facebook.com/profile.php?id=61594024904659",
    path: "M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z",
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@tourconnectt",
    path: "M12.5.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z",
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
