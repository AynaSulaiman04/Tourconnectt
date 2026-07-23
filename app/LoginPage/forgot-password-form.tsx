"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction } from "./actions";
import { initialForgotPasswordFormState } from "./forgot-password-types";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialForgotPasswordFormState,
  );

  return (
    <form className="login-form" action={formAction}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          placeholder="traveler@ttconnect.com"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors.email?.length)}
          aria-describedby={state.fieldErrors.email?.length ? "forgot_email_error" : undefined}
        />
        {state.fieldErrors.email?.length ? (
          <p className="field-error" id="forgot_email_error" role="alert">
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div className="submit-wrap">
        <button className="btn-primary w-full" disabled={pending} type="submit">
          {pending ? "Sending Reset Link" : "Send Reset Link"}
        </button>

        <p
          className={`form-status ${state.success ? "form-status-success" : "form-status-error"}`}
          aria-live="polite"
        >
          {state.message}
        </p>

        <p className="invite-text">
          Remembered your password? <Link href="/LoginPage">Return to login</Link>
        </p>
      </div>
    </form>
  );
}
