"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updatePasswordAction } from "./actions";
import { initialRecoveryFormState } from "./recovery-types";

export function RecoveryForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialRecoveryFormState,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form className="login-form" action={formAction}>
      <div className="field">
        <label htmlFor="password">New Password</label>
        <input
          id="password"
          name="password"
          placeholder="********"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={Boolean(state.fieldErrors.password?.length)}
          aria-describedby={state.fieldErrors.password?.length ? "recovery_password_error" : undefined}
        />
        <label className="password-toggle" htmlFor="recovery_show_password">
          <input
            id="recovery_show_password"
            type="checkbox"
            checked={showPassword}
            onChange={(event) => setShowPassword(event.target.checked)}
          />
          <span>Show password</span>
        </label>
        {state.fieldErrors.password?.length ? (
          <p className="field-error" id="recovery_password_error" role="alert">
            {state.fieldErrors.password[0]}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="confirm_password">Confirm Password</label>
        <input
          id="confirm_password"
          name="confirm_password"
          placeholder="********"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={Boolean(state.fieldErrors.confirmPassword?.length)}
          aria-describedby={
            state.fieldErrors.confirmPassword?.length
              ? "recovery_confirm_password_error"
              : undefined
          }
        />
        {state.fieldErrors.confirmPassword?.length ? (
          <p className="field-error" id="recovery_confirm_password_error" role="alert">
            {state.fieldErrors.confirmPassword[0]}
          </p>
        ) : null}
      </div>

      <div className="submit-wrap">
        <button className="btn-primary w-full" disabled={pending} type="submit">
          {pending ? "Updating Password" : "Update Password"}
        </button>

        <p
          className={`form-status ${state.success ? "form-status-success" : "form-status-error"}`}
          aria-live="polite"
        >
          {state.message}
        </p>

        <p className="invite-text">
          Return to <Link href="/LoginPage">login</Link> after updating your password.
        </p>
      </div>
    </form>
  );
}
