"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import type { TravelerProfile } from "@/lib/supabase/profile-types";
import { NAVBAR_CONFIG, type NavbarVariant } from "./nav-config";
import { NotificationCenter } from "./NotificationCenter";
import { SignOutButton } from "./SignOutButton";

type SidebarNavProps = {
  variant: Extract<NavbarVariant, "admin" | "operator" | "traveler">;
  authResolved?: boolean;
  travelerProfile?: {
    id?: string;
    full_name: string;
    profile_image_url: string | null;
    role?: TravelerProfile["role"];
  } | null;
};

const COLLAPSE_STORAGE_KEY = "tt-portal-sidebar-collapsed";

const collapseListeners = new Set<() => void>();

function subscribeToCollapse(onChange: () => void) {
  collapseListeners.add(onChange);
  // Keep multiple tabs in step.
  window.addEventListener("storage", onChange);
  return () => {
    collapseListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    // Private browsing and blocked site data both throw. Stay expanded.
    return false;
  }
}

/** The server cannot know the preference, so it renders expanded. */
function getCollapsedOnServer() {
  return false;
}

function setCollapsedPreference(next: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // The preference simply will not persist.
  }
  collapseListeners.forEach((listener) => listener());
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ variant, authResolved = false, travelerProfile = null }: SidebarNavProps) {
  const pathname = usePathname();
  const config = NAVBAR_CONFIG[variant];
  const [sessionProfile, setSessionProfile] = useState<SidebarNavProps["travelerProfile"] | undefined>(undefined);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [drawerPathname, setDrawerPathname] = useState(pathname);
  // Desktop rail collapse, read straight from localStorage.
  const collapsed = useSyncExternalStore(
    subscribeToCollapse,
    getCollapsed,
    getCollapsedOnServer,
  );

  function toggleCollapsed() {
    setCollapsedPreference(!collapsed);
  }

  // Close the mobile drawer on navigation. Adjusted during render rather than
  // in an effect: an effect that calls setState synchronously causes a second
  // render pass, so the drawer would briefly still be open on the new route.
  if (pathname !== drawerPathname) {
    setDrawerPathname(pathname);

    if (mobileOpen) {
      setMobileOpen(false);
    }
  }

  const profile = travelerProfile ?? sessionProfile ?? null;
  const currentUserId = profile?.id ?? null;
  const currentRole =
    profile?.role ??
    (variant === "operator" ? "operator" : variant === "traveler" ? "traveler" : "admin");

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

  const settingsItem = config.action;
  const portalLabel =
    variant === "admin" ? "Admin" : variant === "operator" ? "Operator" : "Traveller";
  // The account destination is pinned to the footer, so it must never also
  // appear in the body of the list.
  const workspaceItems = config.items.filter((item) => item.href !== settingsItem.href);

  // Group in first-seen order so the config file's ordering is what ships.
  const sections: Array<{ title: string; items: typeof workspaceItems }> = [];
  for (const item of workspaceItems) {
    const title = item.section ?? "Workspace";
    const existing = sections.find((section) => section.title === title);

    if (existing) {
      existing.items.push(item);
    } else {
      sections.push({ title, items: [item] });
    }
  }
  const roleLabel = currentRole ? currentRole.charAt(0).toUpperCase() + currentRole.slice(1) : portalLabel;

  return (
    <>
      <div className="portal-sidebar-mobile-bar">
        <button
          type="button"
          className="portal-sidebar-mobile-toggle"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((prev) => !prev)}
        >
          <svg className="portal-sidebar-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {mobileOpen ? (
              <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4L10.6 10.6l6.3-6.3z" />
            ) : (
              <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
            )}
          </svg>
        </button>

        <BrandLogo
          className="portal-sidebar-mobile-logo"
          href="/LandingPage"
          linkClassName="portal-sidebar-mobile-brand"
        />
      </div>

      <aside
        className={`portal-sidebar portal-sidebar-${variant} ${mobileOpen ? "is-open" : ""} ${
          collapsed ? "is-collapsed" : ""
        }`}
        data-collapsed={collapsed ? "true" : undefined}
        aria-label={`${portalLabel} portal navigation`}
      >
        <div className="portal-sidebar-brand">
          <div className="portal-sidebar-brand-meta">
            <BrandLogo
              className="portal-sidebar-logo-image"
              href="/LandingPage"
              linkClassName="portal-sidebar-logo"
            />
            <p className="portal-sidebar-role">{portalLabel} portal</p>
          </div>
          <div className="portal-sidebar-brand-actions">
            {currentUserId && currentRole ? (
              <NotificationCenter profileId={currentUserId} role={currentRole} />
            ) : null}
            <button
              type="button"
              className="portal-sidebar-collapse"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 4h2v16H3zM8.7 7.4 10.1 6l6 6-6 6-1.4-1.4L13.3 12z" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="portal-sidebar-nav" aria-label="Primary navigation">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="portal-sidebar-section-title">{section.title}</p>
              <ul className="portal-sidebar-section-list">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`portal-sidebar-link ${active ? "is-active" : ""}`}
                        title={collapsed ? item.label : undefined}
                      >
                        {item.icon ? (
                          <span className="material-symbols-outlined portal-sidebar-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                        ) : null}
                        <span className="portal-sidebar-label">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div>
            <p className="portal-sidebar-section-title">Account</p>
            <ul className="portal-sidebar-section-list">
              <li>
                <Link
                  href={settingsItem.href}
                  aria-current={isActive(pathname, settingsItem.href) ? "page" : undefined}
                  className={`portal-sidebar-link ${isActive(pathname, settingsItem.href) ? "is-active" : ""}`}
                >
                  {settingsItem.icon ? (
                    <span className="material-symbols-outlined portal-sidebar-icon" aria-hidden="true">
                      {settingsItem.icon}
                    </span>
                  ) : null}
                  <span className="portal-sidebar-label">{settingsItem.label}</span>
                </Link>
              </li>
            </ul>
          </div>
        </nav>

        <div className="portal-sidebar-footer">
          <div className="portal-sidebar-user">
            <span className="portal-sidebar-avatar" aria-hidden="true">
              {profile?.profile_image_url ? (
                <Image
                  fill
                  alt=""
                  sizes="32px"
                  src={profile.profile_image_url}
                  className="portal-sidebar-avatar-image"
                />
              ) : (
                <span className="material-symbols-outlined">person</span>
              )}
            </span>
            <div className="portal-sidebar-user-meta">
              <span className="portal-sidebar-user-name">{profile?.full_name ?? portalLabel}</span>
              <span className="portal-sidebar-user-role">{roleLabel}</span>
            </div>
          </div>
          <SignOutButton className="portal-sidebar-signout">
            <span className="material-symbols-outlined" aria-hidden="true">
              logout
            </span>
            <span>Sign out</span>
          </SignOutButton>
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
