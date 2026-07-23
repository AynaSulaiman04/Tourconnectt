"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPortalAuthCookieClient } from "@/lib/supabase/portal-auth";

type SignOutButtonProps = {
  children: ReactNode;
  className?: string;
};

function clearBrowserAuthCookies() {
  const cookieEntries = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("sb-") || entry.startsWith("tt-connect-portal-auth="));

  for (const entry of cookieEntries) {
    const name = entry.split("=")[0];
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; sameSite=lax`;
  }
}

function clearBrowserAuthStorage() {
  try {
    const storageKeys = Object.keys(window.localStorage).filter((key) => key.startsWith("sb-"));
    for (const key of storageKeys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage cleanup issues and continue redirecting home.
  }
}

export function SignOutButton({ children, className }: SignOutButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" }).catch(() => null);
      await fetch("/api/portal-auth", { method: "DELETE" }).catch(() => null);
    } finally {
      clearPortalAuthCookieClient();
      clearBrowserAuthCookies();
      clearBrowserAuthStorage();
      window.location.replace("/");
    }
  }

  return (
    <button className={className} type="button" onClick={() => void handleClick()} disabled={pending}>
      {children}
    </button>
  );
}
