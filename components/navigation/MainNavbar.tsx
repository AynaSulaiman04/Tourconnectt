"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import { NAVBAR_CONFIG, type NavbarVariant } from "./nav-config";
import { getRoleDashboardRoute } from "@/lib/supabase/role-route";
import { NotificationCenter } from "./NotificationCenter";
import { readPortalAuthCookieFromDocument } from "@/lib/supabase/portal-auth";
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

function hasBrowserAuthSession() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .some((entry) => /^sb-.*-auth-token(\.\d+)?=/.test(entry));
}

export function MainNavbar({ variant = "public", travelerProfile = null }: MainNavbarProps) {
  const pathname = usePathname();
  const config = NAVBAR_CONFIG[variant];
  const moreRef = useRef<HTMLDetailsElement | null>(null);
  const [profile, setProfile] = useState(travelerProfile);
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(travelerProfile));
  const [currentUserId, setCurrentUserId] = useState<string | null>(travelerProfile?.id ?? null);
  const [currentRole, setCurrentRole] = useState<TravelerProfile["role"] | null>(
    travelerProfile?.role ?? (variant === "traveler" ? "traveler" : null),
  );
  const visibleItems =
    variant === "public" && isLoggedIn ? config.items.filter((item) => item.label !== "Profile") : config.items;
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
    }

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const portalProfile = readPortalAuthCookieFromDocument();
    const hasSupabaseSession = hasBrowserAuthSession();

    if (!portalProfile || (!hasSupabaseSession && !travelerProfile)) {
      setIsLoggedIn(Boolean(travelerProfile));
      setCurrentUserId(travelerProfile?.id ?? null);
      setCurrentRole(travelerProfile?.role ?? (variant === "traveler" ? "traveler" : null));
      setProfile(travelerProfile);
      return;
    }

    setIsLoggedIn(true);
    setCurrentUserId(travelerProfile?.id ?? portalProfile.id);
    setCurrentRole(travelerProfile?.role ?? portalProfile.role);

    // Prefer the server-provided traveler profile when it exists so stale
    // client cookie data cannot swap in another user's avatar.
    if (travelerProfile) {
      setProfile(travelerProfile);
      return;
    }

    const canShowProfile = variant === "traveler" || portalProfile.role === "traveler";
    setProfile(
      canShowProfile
        ? {
            full_name: portalProfile.full_name || "Traveler",
            profile_image_url: portalProfile.profile_image_url ?? null,
            id: portalProfile.id,
            role: portalProfile.role,
          }
        : null,
    );
  }, [travelerProfile, variant]);

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
