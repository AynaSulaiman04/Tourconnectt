"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getRoleDashboardRoute } from "@/lib/supabase/role-route";
import {
  clearPortalAuthCookieClient,
  setPortalAuthCookieClient,
} from "@/lib/supabase/portal-auth";

type LoginBanner = {
  message: string;
  success: boolean;
};

type LoginFormProps = {
  initialBanner?: LoginBanner | null;
  expectedRole?: "traveler" | "operator" | "admin" | null;
  redirectTo?: string;
};

type LoginFieldErrors = {
  email?: string[];
  password?: string[];
};

function mapAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Wrong email or password.";
  }

  if (normalized.includes("rate limit")) {
    return "Login is temporarily rate limited. Please try again shortly.";
  }

  return message;
}

export function LoginForm({
  initialBanner,
  expectedRole = "traveler",
  redirectTo = "/TravellerProfile",
}: LoginFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(initialBanner?.message ?? "");
  const [success, setSuccess] = useState(initialBanner?.success ?? false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const signupHref =
    expectedRole === "admin"
      ? "/AdminSignUp"
      : expectedRole === "operator"
        ? "/OperatorSignUp"
        : "/SignUp";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    setFieldErrors({});
    setMessage("");
    setSuccess(false);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.user) {
      clearPortalAuthCookieClient();
      const errorMessage = mapAuthError(error?.message ?? "Unable to sign in.");
      setMessage(errorMessage);
      setFieldErrors({
        email: ["Wrong email or password."],
        password: ["Wrong email or password."],
      });
      setSubmitting(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,full_name")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      clearPortalAuthCookieClient();
      setMessage("We could not load your account profile. Please try again.");
      setFieldErrors({
        email: ["Account profile not found."],
        password: ["Account profile not found."],
      });
      setSubmitting(false);
      return;
    }

    if (expectedRole === "traveler" && profile.role && profile.role !== "traveler") {
      await supabase.auth.signOut();
      clearPortalAuthCookieClient();
      setMessage("This sign-in is reserved for traveler accounts. Please use the traveler login.");
      setFieldErrors({
        email: ["Please use the traveler login."],
        password: ["Please use the traveler login."],
      });
      setSubmitting(false);
      return;
    }

    if (expectedRole && expectedRole !== "traveler" && profile.role && profile.role !== expectedRole) {
      await supabase.auth.signOut();
      clearPortalAuthCookieClient();
      const mismatchMessage =
        expectedRole === "operator"
          ? "This sign-in is reserved for operator accounts. Please use an operator account."
          : expectedRole === "admin"
            ? "This sign-in is reserved for admin accounts. Please use an admin account."
            : "Please use the correct traveler account.";

      setMessage(mismatchMessage);
      setFieldErrors({
        email: ["Please use the correct account role."],
        password: ["Please use the correct account role."],
      });
      setSubmitting(false);
      return;
    }

    const resolvedRole = expectedRole === "traveler" ? "traveler" : profile.role ?? expectedRole ?? "traveler";
    setPortalAuthCookieClient({
      id: data.user.id,
      email: data.user.email ?? email.trim().toLowerCase(),
      full_name:
        typeof profile.full_name === "string" && profile.full_name.trim().length > 0
          ? profile.full_name.trim()
          : (data.user.email ?? email).split("@")[0],
      role: resolvedRole,
    });

    await fetch("/api/portal-auth", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: data.user.id,
        email: data.user.email ?? email.trim().toLowerCase(),
        full_name:
          typeof profile.full_name === "string" && profile.full_name.trim().length > 0
            ? profile.full_name.trim()
            : (data.user.email ?? email).split("@")[0],
        role: resolvedRole,
      }),
    });

    setSuccess(true);
    setMessage("Sign in successful. Redirecting...");

    startTransition(() => {
      router.replace(resolvedRole === "traveler" ? redirectTo : getRoleDashboardRoute(resolvedRole));
      router.refresh();
    });
  }

  async function handleGoogleSignIn() {
    setGooglePending(true);
    setFieldErrors({});
    setMessage("");
    setSuccess(false);

    try {
      const healthResponse = await fetch("/api/auth/supabase-health", { cache: "no-store" });
      const health = (await healthResponse.json().catch(() => null)) as { error?: string } | null;

      if (!healthResponse.ok) {
        setMessage(health?.error ?? "Google sign-in is temporarily unavailable.");
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage(error.message || "We could not start Google sign-in.");
        return;
      }

      if (data.url) {
        window.location.assign(data.url);
        return;
      }

      setMessage("We could not start Google sign-in. Please try again.");
    } catch {
      setMessage("Google sign-in is temporarily unavailable. Please try again later.");
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      {expectedRole ? <input name="expected_role" type="hidden" value={expectedRole} /> : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          placeholder="traveler@ttconnect.com"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(fieldErrors.email?.length)}
          aria-describedby={fieldErrors.email?.length ? "login_email_error" : undefined}
        />
        {fieldErrors.email?.length ? (
          <p className="field-error" id="login_email_error" role="alert">
            {fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div className="field">
        <div className="field-row">
          <label htmlFor="password">Password</label>
          <button
            className="forgot-link forgot-button"
            type="button"
            onClick={() => router.push("/LoginPage?mode=forgot")}
            title="Send a password reset link to your email"
          >
            Forgot password?
          </button>
        </div>
        <input
          id="password"
          name="password"
          placeholder="********"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(fieldErrors.password?.length)}
          aria-describedby={fieldErrors.password?.length ? "login_password_error" : undefined}
        />
        <label className="password-toggle" htmlFor="login_show_password">
          <input
            id="login_show_password"
            type="checkbox"
            checked={showPassword}
            onChange={(event) => setShowPassword(event.target.checked)}
          />
          <span>Show password</span>
        </label>
        {fieldErrors.password?.length ? (
          <p className="field-error" id="login_password_error" role="alert">
            {fieldErrors.password[0]}
          </p>
        ) : null}
        {fieldErrors.password?.length ? (
          <p className="invite-text login-help-text">
            Forgot your password? <Link href="/LoginPage?mode=forgot">Request a reset link</Link>
          </p>
        ) : null}
        <p className="forgot-hint">
          Use the email above to sign in. If that fails, you can request a reset link.
        </p>
      </div>

      <div className="submit-wrap">
        <button className="btn-primary w-full" disabled={submitting || pending} type="submit">
          {submitting || pending ? "Signing In" : "Sign In"}
        </button>

        <button
          className="btn-outline w-full auth-google-button"
          disabled={submitting || pending || googlePending}
          type="button"
          onClick={handleGoogleSignIn}
        >
          <span className="auth-google-mark" aria-hidden="true">
            G
          </span>
          <span>{googlePending ? "Connecting with Google" : "Continue with Google"}</span>
        </button>

        <p
          className={`form-status ${success ? "form-status-success" : "form-status-error"}`}
          aria-live="polite"
        >
          {message}
        </p>
      </div>

      <div className="alternative-actions">
        <div className="divider-row">
          <div />
          <span>OR</span>
          <div />
        </div>

        <p className="invite-text invite-text-prominent">
          New to Tour ConnecTT? <Link href={signupHref}>Sign up here</Link>
        </p>
      </div>

    </form>
  );
}
