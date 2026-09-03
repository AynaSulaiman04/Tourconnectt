"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getRoleDashboardRoute } from "@/lib/supabase/role-route";

type HashKind = "none" | "tokens" | "error";

function readHashParams() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  return hash ? new URLSearchParams(hash) : null;
}

// The fragment is fixed for the life of this navigation, so there is nothing to
// subscribe to.
function subscribeToNothing() {
  return () => {};
}

function getClientHashKind(): HashKind {
  const params = readHashParams();

  if (!params) {
    return "none";
  }

  if (params.get("error_description") || params.get("error")) {
    return "error";
  }

  return params.get("access_token") && params.get("refresh_token") ? "tokens" : "none";
}

// The server has no fragment — it is never sent in the request.
function getServerHashKind(): HashKind {
  return "none";
}

/** Credentials must not linger in the address bar, history, or a copied link. */
function clearHash() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/**
 * Completes an email-link sign-in that arrives in the URL fragment.
 *
 * Signup confirmation and password recovery links are generated server-side, so
 * they carry no PKCE verifier and Supabase returns the session in the fragment
 * (`#access_token=...&refresh_token=...&type=signup`) instead of as a `?code=`
 * query parameter. Fragments never reach the server, so `/auth/callback` finds
 * no code, forwards here, and the session used to be dropped — the address was
 * confirmed but the visitor landed on a login form with no explanation.
 */
export function AuthHashHandler() {
  const router = useRouter();
  const hashKind = useSyncExternalStore(subscribeToNothing, getClientHashKind, getServerHashKind);
  // Only ever set from an async callback, so the effect body stays free of
  // synchronous state updates and their extra render pass.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (hashKind === "error") {
      clearHash();
      return;
    }

    if (hashKind !== "tokens") {
      return;
    }

    const params = readHashParams();
    const accessToken = params?.get("access_token");
    const refreshToken = params?.get("refresh_token");
    const linkType = params?.get("type");

    if (!accessToken || !refreshToken) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (cancelled) {
          return;
        }

        clearHash();

        if (error || !data.user) {
          setFailed(true);
          return;
        }

        // A recovery link has to land on the new-password form, not a dashboard.
        if (linkType === "recovery") {
          router.replace("/LoginPage?mode=recovery");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();

        router.replace(getRoleDashboardRoute(profile?.role));
      } catch {
        if (!cancelled) {
          clearHash();
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hashKind, router]);

  if (hashKind === "none" && !failed) {
    return null;
  }

  const isFailure = failed || hashKind === "error";

  return (
    <p className="auth-form-message" role="status" aria-live="polite">
      {isFailure
        ? "That link has expired or has already been used. Sign in below, or request a new link."
        : "Confirming your account..."}
    </p>
  );
}
