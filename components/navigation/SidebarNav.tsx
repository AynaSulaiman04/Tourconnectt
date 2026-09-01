"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import { NAVBAR_CONFIG, type NavbarVariant } from "./nav-config";
import { NotificationCenter } from "./NotificationCenter";
import { SignOutButton } from "./SignOutButton";

type SidebarNavProps = {
  variant: Extract<NavbarVariant, "admin" | "operator">;
  authResolved?: boolean;
  travelerProfile?: {
    id?: string;
    full_name: string;
    profile_image_url: string | null;
    role?: TravelerProfile["role"];
  } | null;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ variant, authResolved = false, travelerProfile = null }: SidebarNavProps) {
  const pathname = usePathname();
  const config = NAVBAR_CONFIG[variant];
  const [sessionProfile, setSessionProfile] = useState<SidebarNavProps["travelerProfile"] | undefined>(undefined);
  const [mobileOpen, setMobileOpen] = useState(false);
  const profile = travelerProfile ?? sessionProfile ?? null;
  const currentUserId = profile?.id ?? null;
  const currentRole = profile?.role ?? (variant === "operator" ? "operator" : "admin");

  useEffect(() => {
    if (authResolved || travelerProfile) {
      return;
    }

    let cancelled = false;
    void fetch("/api/portal-auth", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const result = (await response.json()) as {
          profile?: NonNullable<SidebarNavProps["travelerProfile"]>;
        };
        return result.profile ?? null;
      })
      .catch(() => null)
      .then((nextProfile) => {
        if (!cancelled) setSessionProfile(nextProfile);
      });

    return () => {
      cancelled = true;
    };
  }, [authResolved, travelerProfile]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const items = config.items;
  const settingsItem = config.action;
  const portalLabel = variant === "admin" ? "Admin" : "Operator";

  return (
    <>
      <button
        type="button"
        className="portal-sidebar-mobile-toggle"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((prev) => !prev)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {mobileOpen ? "close" : "menu"}
        </span>
      </button>

      <aside
        className={`portal-sidebar portal-sidebar-${variant} ${mobileOpen ? "is-open" : ""}`}
        aria-label={`${portalLabel} portal navigation`}
      >
        <div className="portal-sidebar-brand">
          <BrandLogo href="/LandingPage" priority variant="header" />
          <p className="portal-sidebar-role">{portalLabel} portal</p>
        </div>

        <nav className="portal-sidebar-nav" aria-label="Primary navigation">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`portal-sidebar-link ${active ? "is-active" : ""}`}
              >
                {item.icon ? (
                  <span className="material-symbols-outlined portal-sidebar-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                <span className="portal-sidebar-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="portal-sidebar-footer">
          <Link
            href={settingsItem.href}
            className={`portal-sidebar-link ${isActive(pathname, settingsItem.href) ? "is-active" : ""}`}
          >
            {settingsItem.icon ? (
              <span className="material-symbols-outlined portal-sidebar-icon" aria-hidden="true">
                {settingsItem.icon}
              </span>
            ) : null}
            <span className="portal-sidebar-label">{settingsItem.label}</span>
          </Link>

          <div className="portal-sidebar-user">
            {currentUserId && currentRole ? (
              <NotificationCenter profileId={currentUserId} role={currentRole} />
            ) : null}
            <div className="portal-sidebar-user-info">
              <span className="portal-sidebar-avatar" aria-hidden="true">
                {profile?.profile_image_url ? (
                  <Image
                    fill
                    alt=""
                    sizes="36px"
                    src={profile.profile_image_url}
                    className="portal-sidebar-avatar-image"
                  />
                ) : (
                  <span className="material-symbols-outlined">person</span>
                )}
              </span>
              <span className="portal-sidebar-user-name">{profile?.full_name ?? portalLabel}</span>
            </div>
            <SignOutButton className="portal-sidebar-signout">
              <span className="material-symbols-outlined" aria-hidden="true">
                logout
              </span>
              <span>Sign out</span>
            </SignOutButton>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="portal-sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
    </>
  );
}
