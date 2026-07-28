"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import { NAVBAR_CONFIG, type NavbarVariant } from "./nav-config";
import { getRoleDashboardRoute } from "@/lib/supabase/role-route";
import { NotificationCenter } from "./NotificationCenter";
import { SignOutButton } from "./SignOutButton";

type MainNavbarProps = {
  variant?: NavbarVariant;
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

const MAX_INLINE_ITEMS = 4;

export function MainNavbar({ variant = "public", travelerProfile = null }: MainNavbarProps) {
  const pathname = usePathname();
  const config = NAVBAR_CONFIG[variant];
  const moreRef = useRef<HTMLDetailsElement | null>(null);
  const mobileRef = useRef<HTMLDetailsElement | null>(null);
  const [sessionProfile, setSessionProfile] = useState<MainNavbarProps["travelerProfile"] | undefined>(
    undefined,
  );
  const profile = travelerProfile ?? sessionProfile ?? null;
  const isLoggedIn = Boolean(profile);
  const currentUserId = profile?.id ?? null;
  const currentRole = profile?.role ?? (variant === "traveler" && profile ? "traveler" : null);
  const visibleItems =
    variant === "public" && isLoggedIn && currentRole === "traveler"
      ? config.items.filter((item) => item.label !== "Profile")
      : config.items;
  const inlineItems = visibleItems.slice(0, MAX_INLINE_ITEMS);
  const overflowItems = visibleItems.slice(MAX_INLINE_ITEMS);
  const showTravelerPanel = Boolean(
    profile && (variant === "traveler" || currentRole === "traveler" || pathname === "/ConciergeChat"),
  );
  const publicAction = variant === "public" && !isLoggedIn ? config.action : null;

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        moreRef.current.open = false;
      }
      if (mobileRef.current && !mobileRef.current.contains(event.target as Node)) {
        mobileRef.current.open = false;
      }
    }

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (travelerProfile) {
      return;
    }

    let cancelled = false;

    void fetch("/api/portal-auth", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        const result = (await response.json()) as {
          profile?: NonNullable<MainNavbarProps["travelerProfile"]>;
        };
        return result.profile ?? null;
      })
      .catch(() => null)
      .then((nextProfile) => {
        if (!cancelled) {
          setSessionProfile(nextProfile);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [travelerProfile]);

  return (
    <header className={`top-nav top-nav-${variant}`}>
      <div className="page-shell-inner top-nav-inner">
        <Link href="/" className="brand-lockup" aria-label="Tour ConnecTT home">
          <span className="brand-lockup-title">Tour ConnecTT</span>
        </Link>

        <nav className="top-nav-links" aria-label="Primary navigation">
          {inlineItems.map((item) => {
            const href =
              variant === "public" && item.label === "Profile"
                ? isLoggedIn
                  ? getRoleDashboardRoute(currentRole ?? "traveler")
                  : "/SignUp"
                : item.href;
            const active = isActive(pathname, href);
            return (
              <Link
                key={item.href}
                className={`nav-link ${active ? "nav-link-active" : ""}`}
                href={href}
              >
                {item.label}
              </Link>
            );
          })}
          {overflowItems.length > 0 ? (
            <details className="nav-more" ref={moreRef}>
              <summary
                className={`nav-link nav-more-summary ${overflowItems.some((item) => isActive(pathname, item.href)) ? "nav-link-active" : ""}`}
              >
                More
                <span className="material-symbols-outlined nav-more-icon" aria-hidden="true">
                  expand_more
                </span>
              </summary>
              <div className="nav-more-menu" role="menu">
                {overflowItems.map((item) => {
                  const href =
                    variant === "public" && item.label === "Profile"
                      ? isLoggedIn
                        ? getRoleDashboardRoute(currentRole ?? "traveler")
                        : "/SignUp"
                      : item.href;
                  const active = isActive(pathname, href);
                  return (
                    <Link
                      key={item.href}
                      className={`nav-more-link ${active ? "nav-more-link-active" : ""}`}
                      href={href}
                      role="menuitem"
                      onClick={() => {
                        if (moreRef.current) {
                          moreRef.current.open = false;
                        }
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </details>
          ) : null}
        </nav>

        <div className="top-nav-actions">
          <details className="mobile-nav" ref={mobileRef}>
            <summary className="btn-icon mobile-nav-toggle" aria-label="Open navigation menu">
              <span className="material-symbols-outlined mobile-nav-open-icon" aria-hidden="true">
                menu
              </span>
              <span className="material-symbols-outlined mobile-nav-close-icon" aria-hidden="true">
                close
              </span>
            </summary>
            <nav className="mobile-nav-menu" aria-label="Mobile navigation">
              {config.items.map((item) => {
                const href =
                  variant === "public" && item.label === "Profile"
                    ? isLoggedIn
                      ? getRoleDashboardRoute(currentRole ?? "traveler")
                      : "/SignUp"
                    : item.href;
                const active = isActive(pathname, href);

                return (
                  <Link
                    key={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`mobile-nav-link ${active ? "mobile-nav-link-active" : ""}`}
                    href={href}
                    onClick={() => {
                      if (mobileRef.current) {
                        mobileRef.current.open = false;
                      }
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
              {variant === "operator" || variant === "admin" ? (
                <Link
                  className="mobile-nav-link"
                  href={config.action.href}
                  onClick={() => {
                    if (mobileRef.current) {
                      mobileRef.current.open = false;
                    }
                  }}
                >
                  Settings
                </Link>
              ) : null}
              {isLoggedIn ? (
                <SignOutButton className="mobile-nav-signout">Sign out</SignOutButton>
              ) : null}
            </nav>
          </details>
          {variant === "admin" ? (
            <Link className="btn-icon" href="/AdminSettings" aria-label="Admin settings">
              <span className="material-symbols-outlined" aria-hidden="true">
                settings
              </span>
            </Link>
          ) : null}
          {currentUserId && currentRole ? <NotificationCenter profileId={currentUserId} role={currentRole} /> : null}
          {showTravelerPanel ? (
            <div className="traveler-nav-panel">
              <Link className="traveler-nav-user" href="/TravellerProfile" aria-label="Traveler profile">
                <span className="traveler-nav-avatar" aria-hidden="true">
                  {profile?.profile_image_url ? (
                    <Image
                      fill
                      alt=""
                      className="traveler-nav-avatar-image"
                      sizes="36px"
                      src={profile.profile_image_url}
                    />
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="traveler-nav-icon"
                    >
                      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
                      <path
                        d="M5.5 19.5c.72-3.48 3.87-6 6.5-6s5.78 2.52 6.5 6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </span>
              </Link>
              <SignOutButton className="traveler-nav-upload">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    logout
                  </span>
                  <span>Sign out</span>
              </SignOutButton>
            </div>
          ) : isLoggedIn && variant !== "public" ? (
            <SignOutButton className="btn-outline">Sign out</SignOutButton>
          ) : publicAction ? (
            <Link className="btn-outline" href={publicAction.href}>
              {publicAction.label}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
