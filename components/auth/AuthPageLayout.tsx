import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AuthHeroSlideshow } from "./AuthHeroSlideshow";
import { AUTH_HERO_COPY } from "@/lib/auth-hero-images";

import "@/app/auth-pages.css";

type AuthPageLayoutProps = {
  title: string;
  description: string;
  heroTitle?: string;
  heroImages: string[];
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthPageLayout({
  title,
  description,
  heroTitle = AUTH_HERO_COPY,
  heroImages,
  children,
  footer,
}: AuthPageLayoutProps) {
  return (
    <main className="auth-page">
      <AuthHeroSlideshow heroTitle={heroTitle} images={heroImages} />

      <section className="auth-form-panel">
        <div className="auth-form-shell">
          <div className="auth-mobile-brand">
            <BrandLogo href="/LandingPage" priority variant="header" />
          </div>

          <header className="auth-form-header">
            <h1>{title}</h1>
            <p>{description}</p>
          </header>

          {children}

          {footer ? <footer className="auth-form-footer">{footer}</footer> : null}
        </div>
      </section>
    </main>
  );
}
