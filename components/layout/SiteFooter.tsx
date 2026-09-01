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
        <p>&copy; 2026 TOURCONNECTT. ALL RIGHTS RESERVED.</p>

        <div className="site-footer-bottom-links">
          <Link href="/PrivacyPolicy">Privacy</Link>
          <Link href="/TermsOfService">Terms</Link>
          <div className="site-footer-socials" aria-label="Social links">
            <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram">
              ig
            </a>
            <a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook">
              f
            </a>
            <a href="https://www.x.com/" target="_blank" rel="noreferrer" aria-label="X">
              x
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
