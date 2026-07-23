import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { ForgotPasswordForm } from "./forgot-password-form";
import { RecoveryForm } from "./recovery-form";
import { PageShell } from "@/components/layout/PageShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";

type LoginPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
    signup?: string | string[];
    auth?: string | string[];
    redirect?: string | string[];
    expected_role?: string | string[];
  }>;
};

function normalizeRedirectTarget(value?: string | string[]) {
  const target = Array.isArray(value) ? value[0] : value;

  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return "/TravellerProfile";
  }

  return target;
}

function normalizeExpectedRole(value?: string | string[]) {
  const target = Array.isArray(value) ? value[0] : value;

  if (target === "traveler" || target === "operator" || target === "admin") {
    return target;
  }

  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (authData.user) {
    const profileContext = await getOptionalCurrentUserProfile();
    if (profileContext?.profile) {
      redirect(getRoleDashboardRoute(profileContext.profile.role));
    }
  }

  const isRecoveryMode = resolvedSearchParams.mode === "recovery";
  const isForgotMode = resolvedSearchParams.mode === "forgot";
  const expectedRole = normalizeExpectedRole(resolvedSearchParams.expected_role);
  const isOperatorMode = expectedRole === "operator" || resolvedSearchParams.mode === "operator";
  const isAdminMode = expectedRole === "admin" || resolvedSearchParams.mode === "admin";
  const redirectTo = normalizeRedirectTarget(resolvedSearchParams.redirect);
  const signupStatus = Array.isArray(resolvedSearchParams.signup)
    ? resolvedSearchParams.signup[0]
    : resolvedSearchParams.signup;
  const authStatus = Array.isArray(resolvedSearchParams.auth)
    ? resolvedSearchParams.auth[0]
    : resolvedSearchParams.auth;
  const initialBanner =
    signupStatus === "success"
      ? {
          message: "Your account is ready. Sign in with your email and password.",
          success: true,
        }
      : authStatus === "error"
        ? {
            message: "We could not complete the secure sign-in link. Please try again.",
            success: false,
          }
        : null;

  return (
    <PageShell variant="public">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .login-page {
          position: relative;
          min-height: calc(100dvh - 4.75rem);
          display: flex;
          flex-direction: column;
          align-items: stretch;
          background: var(--background);
          color: var(--on-background);
        }

        .image-section {
          display: none;
          position: relative;
          height: calc(100dvh - 4.75rem);
          overflow: hidden;
        }

        .cinematic-zoom:hover img {
          transform: scale(1.05);
        }

        .cinematic-zoom img {
          transition: transform 12s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .desert-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .image-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, transparent, rgba(252, 249, 248, 0.2));
        }

        .desktop-brand {
          position: absolute;
          top: 48px;
          left: 48px;
        }

        .brand-text {
          font-family: 'Raleway', sans-serif;
          font-size: 32px;
          line-height: 40px;
          letter-spacing: -0.01em;
          font-weight: 300;
          color: white;
          text-transform: lowercase;
          filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.15));
        }

        .image-copy {
          position: absolute;
          bottom: 80px;
          left: 80px;
          max-width: 512px;
        }

        .image-copy h2 {
          margin: 0 0 24px;
          font-family: 'Raleway', sans-serif;
          font-size: 48px;
          line-height: 56px;
          letter-spacing: -0.02em;
          font-weight: 300;
          color: white;
        }

        .image-copy-line {
          width: 96px;
          height: 1px;
          background: rgba(255, 255, 255, 0.4);
        }

        .form-section {
          position: relative;
          flex: 1;
          min-height: calc(100dvh - 4.75rem);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 24px 24px 56px;
          background: var(--background);
          overflow: hidden;
        }

        .mobile-brand {
          margin-bottom: 48px;
          align-self: flex-start;
        }

        .mobile-brand .brand-text {
          color: var(--primary);
        }

        .form-wrap {
          width: 100%;
          max-width: 448px;
        }

        .form-header {
          margin-bottom: 48px;
        }

        .form-header h1 {
          margin: 0 0 8px;
          font-family: 'Raleway', sans-serif;
          font-size: 48px;
          line-height: 56px;
          letter-spacing: -0.02em;
          font-weight: 300;
          color: var(--on-background);
        }

        .form-header p {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 16px;
          line-height: 24px;
          font-weight: 300;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .field {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .field label {
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--on-surface-variant);
        }

        .forgot-link {
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.1em;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--primary);
          transition: color 0.2s ease;
        }

        .forgot-button {
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
        }

        .forgot-link:hover {
          color: var(--secondary);
        }

        .field input:not([type="checkbox"]) {
          width: 100%;
          background: transparent;
          border: 0;
          border-bottom: 1px solid var(--outline-variant);
          padding: 12px 0;
          outline: none;
          color: var(--on-background);
          font-size: 16px;
          line-height: 24px;
          transition: border-color 0.2s ease;
        }

        .field input:not([type="checkbox"])::placeholder {
          color: rgba(206, 197, 185, 0.5);
        }

        .field input:not([type="checkbox"]):focus {
          border-bottom-color: var(--secondary);
        }

        .field input:not([type="checkbox"])[aria-invalid="true"] {
          border-bottom-color: var(--error);
        }

        .field input:not([type="checkbox"])[aria-invalid="true"]:focus {
          border-bottom-color: var(--error);
        }

        .password-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          color: var(--on-surface-variant);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.08em;
          font-weight: 500;
          text-transform: uppercase;
          cursor: pointer;
        }

        .password-toggle input {
          width: 14px;
          height: 14px;
          margin: 0;
          padding: 0;
          border: 0;
          background: transparent;
          accent-color: var(--primary);
        }

        .field-error {
          margin: 0;
          color: var(--secondary);
          font-size: 12px;
          line-height: 18px;
          font-weight: 500;
        }

        .submit-wrap {
          padding-top: 32px;
        }

        .submit-wrap button:disabled {
          opacity: 0.72;
          cursor: progress;
        }

        .form-status {
          min-height: 36px;
          margin: 16px 0 0;
          padding: 12px 14px;
          border: 1px solid transparent;
          border-radius: 16px;
          font-size: 14px;
          line-height: 22px;
          font-weight: 300;
        }

        .form-status:empty {
          display: none;
        }

        .form-status-error {
          border-color: rgba(186, 26, 26, 0.2);
          background: rgba(186, 26, 26, 0.08);
          color: var(--error);
        }

        .form-status-success {
          border-color: rgba(180, 122, 22, 0.16);
          background: rgba(180, 122, 22, 0.06);
          color: var(--on-surface-variant);
        }

        .sign-in-button {
          width: 100%;
          padding: 16px 48px;
          border: 1px solid var(--on-background);
          background: transparent;
          color: var(--on-background);
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.2em;
          font-weight: 600;
          text-transform: uppercase;
          transition: all 0.5s ease;
          cursor: pointer;
        }

        .sign-in-button:hover {
          background: var(--surface-container-low);
        }

        .sign-in-button:active {
          transform: scale(0.98);
        }

        .alternative-actions {
          margin-top: 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }

        .divider-row {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 16px;
        }

        .divider-row div {
          height: 1px;
          flex: 1;
          background: rgba(206, 197, 185, 0.2);
        }

        .divider-row span {
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          color: rgba(75, 70, 61, 0.4);
        }

        .icon-actions {
          display: flex;
          gap: 32px;
        }

        .round-button {
          width: 58px;
          height: 58px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          border-radius: 999px;
          border: 1px solid rgba(206, 197, 185, 0.3);
          background: transparent;
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .round-button:hover {
          background: var(--surface-container-low);
        }

        .round-button span {
          color: var(--on-surface-variant);
        }

        .invite-text {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 14px;
          line-height: 22px;
          font-weight: 300;
        }

        .invite-text a {
          color: var(--primary);
          font-weight: 500;
        }

        .invite-text a:hover {
          text-decoration: underline;
          text-decoration-color: var(--outline-variant);
        }

        .invite-text-prominent {
          align-self: center;
          width: 100%;
          text-align: center;
          font-size: 15px;
          line-height: 24px;
        }

        .login-help-text {
          margin-top: 10px;
        }

        .forgot-hint {
          margin: 8px 0 0;
          color: rgba(90, 82, 75, 0.72);
          font-size: 12px;
          line-height: 18px;
          font-weight: 300;
        }

        .login-footer-links {
          margin-top: 32px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
          justify-content: center;
          padding-bottom: 8px;
          color: var(--on-surface-variant);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.12em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .login-footer-links a {
          color: var(--on-surface-variant);
        }

        .login-footer-links a:hover {
          color: var(--secondary);
        }

        .form-footer {
          margin-top: 32px;
          align-self: flex-start;
        }

        .form-footer p {
          margin: 0;
          color: rgba(75, 70, 61, 0.4);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.1em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .floating-line {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          display: none;
        }

        .floating-line div {
          width: 1px;
          height: 128px;
          background: linear-gradient(to bottom, transparent, rgba(206, 197, 185, 0.3), transparent);
        }

        @media (min-width: 768px) {
          .login-page {
            flex-direction: row;
            height: calc(100dvh - 4.75rem);
            min-height: 0;
            overflow: hidden;
          }

          .image-section {
            display: block;
            width: 50%;
          }

          .form-section {
            min-height: 0;
            height: 100%;
            padding: clamp(24px, 4vh, 40px) clamp(32px, 6vw, 80px);
          }

          .mobile-brand {
            display: none;
          }

          .form-footer {
            align-self: flex-start;
          }
        }

        @media (min-width: 768px) and (max-height: 900px) {
          .form-section { padding: 16px clamp(32px, 5vw, 72px); }
          .form-header { margin-bottom: 14px; }
          .form-header h1 { font-size: 38px; line-height: 42px; }
          .login-form { gap: 12px; }
          .field { gap: 4px; }
          .field input:not([type="checkbox"]) { padding: 7px 0; line-height: 20px; }
          .password-toggle { margin-top: 2px; font-size: 10px; line-height: 14px; }
          .forgot-hint { margin-top: 4px; line-height: 16px; }
          .submit-wrap { padding-top: 6px; }
          .alternative-actions { margin-top: 14px; gap: 9px; }
          .login-footer-links, .form-footer { margin-top: 12px; }
          .round-button { width: 48px; height: 48px; padding: 12px; }
        }

        @media (min-width: 768px) and (max-height: 650px) {
          .form-section { padding-top: 8px; padding-bottom: 8px; }
          .form-header { margin-bottom: 8px; }
          .form-header h1 { font-size: 34px; line-height: 42px; }
          .login-form { gap: 8px; }
          .field input:not([type="checkbox"]) { padding: 5px 0; }
          .submit-wrap { padding-top: 2px; }
          .alternative-actions { margin-top: 8px; gap: 6px; }
          .login-footer-links { margin-top: 6px; padding-bottom: 0; }
          .form-footer { display: none; }
        }

        @media (max-width: 767px) {
          .login-page { height: calc(100dvh - 4.75rem); min-height: 0; overflow: hidden; }
          .form-section { min-height: 0; height: 100%; overflow: hidden; padding: 14px 20px; }
          .mobile-brand { display: none; }
          .form-header { margin-bottom: 14px; }
          .form-header h1 { font-size: 36px; line-height: 40px; }
          .login-form { gap: 12px; }
          .field { gap: 4px; }
          .field input:not([type="checkbox"]) { padding: 7px 0; line-height: 20px; }
          .password-toggle { margin-top: 2px; font-size: 10px; line-height: 14px; }
          .forgot-hint { margin-top: 4px; line-height: 16px; }
          .submit-wrap { padding-top: 6px; }
          .alternative-actions { margin-top: 14px; gap: 9px; }
          .login-footer-links, .form-footer { margin-top: 12px; }
        }

        @media (max-width: 767px) and (max-height: 620px) {
          .form-section { padding-top: 8px; padding-bottom: 8px; }
          .form-header { margin-bottom: 8px; }
          .form-header h1 { font-size: 32px; line-height: 40px; }
          .login-form { gap: 8px; }
          .field input:not([type="checkbox"]) { padding: 5px 0; }
          .submit-wrap { padding-top: 2px; }
          .alternative-actions { margin-top: 8px; gap: 6px; }
          .login-footer-links { margin-top: 6px; padding-bottom: 0; }
          .form-footer { display: none; }
        }

        @media (min-width: 1024px) {
          .image-section {
            width: 60%;
          }

          .floating-line {
            display: block;
          }
        }
      `}</style>

      <main className="login-page">
        <section className="image-section cinematic-zoom">
          <Image
            className="desert-image"
            alt="Cinematic desert landscape"
            loading="eager"
            fetchPriority="high"
            fill
            quality={100}
            sizes="(max-width: 1024px) 100vw, 60vw"
            src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=3840&q=95"
          />
          <div className="image-gradient" />

          <div className="desktop-brand">
            <span className="brand-text">Tour ConnecTT</span>
          </div>

          <div className="image-copy">
            <h2>Return to the vast silence of the dunes.</h2>
            <div className="image-copy-line" />
          </div>
        </section>

        <section className="form-section">
          <div className="mobile-brand">
            <span className="brand-text">Tour ConnecTT</span>
          </div>

          <div className="form-wrap">
            <header className="form-header">
              <h1>
                {isRecoveryMode
                  ? "Reset Password"
                  : isForgotMode
                    ? "Forgot Password"
                    : isAdminMode
                      ? "Admin Login"
                      : isOperatorMode
                        ? "Operator Login"
                        : "Login"}
              </h1>
              <p>
                {isRecoveryMode
                  ? "Choose a new password for your traveler account."
                  : isForgotMode
                    ? "Enter the email tied to your account and we will send a reset link."
                    : isAdminMode
                      ? "Enter your administrator credentials to access the admin dashboard."
                      : isOperatorMode
                        ? "Enter your operator credentials to access the operator dashboard."
                        : "Enter your credentials to access your private collection."}
              </p>
            </header>

            {isRecoveryMode ? (
              <RecoveryForm />
            ) : isForgotMode ? (
              <ForgotPasswordForm />
            ) : (
              <LoginForm
                expectedRole={isAdminMode ? "admin" : isOperatorMode ? "operator" : "traveler"}
                initialBanner={initialBanner}
                redirectTo={redirectTo}
              />
            )}

          </div>

          <footer className="form-footer">
            <p>
              &copy; 2026 TOURCONNECTT. ALL RIGHTS RESERVED.{" "}
              <Link href="/PrivacyPolicy">Privacy Policy</Link>{" "}
              <Link href="/TermsOfService">Terms of Service</Link>
            </p>
          </footer>
        </section>

        <div className="floating-line">
          <div />
        </div>
      </main>
    </PageShell>
  );
}
