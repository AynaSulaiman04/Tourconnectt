"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SignupFormState } from "./types";
import { initialSignupFormState } from "./types";

type SignupAction = (
  state: SignupFormState,
  formData: FormData,
) => Promise<SignupFormState>;

type SignupVariant = "traveler" | "operator" | "admin";

type SignupFormProps = {
  action: SignupAction;
  variant?: SignupVariant;
};

const variantCopy: Record<SignupVariant, { title: string; description: string; loginHref: string; loginLabel: string }> = {
  traveler: {
    title: "Sign Up",
    description: "Create your private traveler profile.",
    loginHref: "/LoginPage",
    loginLabel: "Log in here",
  },
  operator: {
    title: "Operator Sign Up",
    description: "Create your operator access profile.",
    loginHref: "/OperatorLogin",
    loginLabel: "Log in here",
  },
  admin: {
    title: "Admin Sign Up",
    description: "Create your administrator access profile.",
    loginHref: "/AdminLogin",
    loginLabel: "Log in here",
  },
};

export function SignupForm({ action, variant = "traveler" }: SignupFormProps) {
  const [state, formAction, pending] = useActionState(action, initialSignupFormState);
  const [showPassword, setShowPassword] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [oauthMessage, setOauthMessage] = useState("");
  const statusMessage = oauthMessage || state.message;
  const statusIsSuccess = Boolean(state.success && !oauthMessage);
  const copy = variantCopy[variant];

  async function handleGoogleSignUp() {
    setGooglePending(true);
    setOauthMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setOauthMessage(error.message || "We could not start Google sign-up.");
        return;
      }

      if (data.url) {
        window.location.assign(data.url);
        return;
      }

      setOauthMessage("We could not start Google sign-up. Please try again.");
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <form className="signup-form" action={formAction}>
      <div className="field">
        <label htmlFor="full_name">Full Name</label>
        <input
          id="full_name"
          name="full_name"
          placeholder="Elias Thorne"
          type="text"
          autoComplete="name"
          required
          aria-invalid={Boolean(state.fieldErrors.fullName?.length)}
          aria-describedby={state.fieldErrors.fullName?.length ? "full_name_error" : undefined}
        />
        {state.fieldErrors.fullName?.length ? (
          <p className="field-error" id="full_name_error" role="alert">
            {state.fieldErrors.fullName[0]}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="email">Email Address</label>
        <input
          id="email"
          name="email"
          placeholder="elias@ttconnect.com"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors.email?.length)}
          aria-describedby={state.fieldErrors.email?.length ? "email_error" : undefined}
        />
        {state.fieldErrors.email?.length ? (
          <p className="field-error" id="email_error" role="alert">
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          placeholder="********"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={Boolean(state.fieldErrors.password?.length)}
          aria-describedby={state.fieldErrors.password?.length ? "password_error" : undefined}
        />
        <label className="password-toggle" htmlFor="signup_show_password">
          <input
            id="signup_show_password"
            type="checkbox"
            checked={showPassword}
            onChange={(event) => setShowPassword(event.target.checked)}
          />
          <span>Show password</span>
        </label>
        {state.fieldErrors.password?.length ? (
          <p className="field-error" id="password_error" role="alert">
            {state.fieldErrors.password[0]}
          </p>
        ) : null}
      </div>

      <div className="submit-wrap">
        <button className="btn-primary w-full" disabled={pending} type="submit">
          {pending ? "Creating Account" : "Complete Registration"}
        </button>

        {variant === "traveler" ? (
          <button
            className="btn-outline w-full auth-google-button"
            disabled={pending || googlePending}
            type="button"
            onClick={handleGoogleSignUp}
          >
            <span className="auth-google-mark" aria-hidden="true">
              G
            </span>
            <span>{googlePending ? "Connecting with Google" : "Sign up with Google"}</span>
          </button>
        ) : null}

        <p
          className={`form-status ${statusIsSuccess ? "form-status-success" : "form-status-error"}`}
          aria-live="polite"
        >
          {statusMessage}
        </p>

        <p className="terms-text">
          By joining, you agree to our <Link href="/PrivacyPolicy">Privacy Policy</Link> and{" "}
          <Link href="/TermsOfService">Terms of Service</Link>.
        </p>
      </div>

      <div className="alternative-actions">
        <div className="divider-row">
          <div />
          <span>OR</span>
          <div />
        </div>

        <p className="invite-text">
          Already have an account? <Link href={copy.loginHref}>{copy.loginLabel}</Link>
        </p>
      </div>
    </form>
  );
}
