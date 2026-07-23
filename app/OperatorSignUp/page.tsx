import Image from "next/image";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { SignupForm } from "@/app/SignUp/signup-form";
import { signUpOperatorAction } from "@/app/SignUp/actions";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";

export default async function OperatorSignUpPage() {
  const profileContext = await getOptionalCurrentUserProfile();

  if (profileContext?.profile) {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  return (
    <PageShell variant="public">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .signup-page {
          position: relative;
          height: calc(100dvh - 4.75rem);
          overflow: hidden;
          display: flex;
          background: var(--background);
          color: var(--on-background);
        }

        .image-section,
        .form-section {
          width: 50%;
          height: 100%;
        }

        .image-section {
          position: relative;
          overflow: hidden;
        }

        .desert-image {
          object-fit: cover;
        }

        .cinematic-zoom:hover img {
          transform: scale(1.05);
        }

        .cinematic-zoom img {
          transition: transform 12s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .image-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, transparent, rgba(252, 249, 248, 0.18));
        }

        .desktop-brand {
          position: absolute;
          top: 48px;
          left: 56px;
        }

        .brand-text {
          font-family: 'Raleway', sans-serif;
          font-size: 32px;
          line-height: 40px;
          font-weight: 300;
          color: white;
          text-transform: lowercase;
        }

        .image-copy {
          position: absolute;
          left: 56px;
          right: 56px;
          bottom: 72px;
          max-width: 560px;
        }

        .image-copy h2 {
          margin: 0 0 24px;
          font-family: 'Raleway', sans-serif;
          font-size: 48px;
          line-height: 56px;
          font-weight: 300;
          color: white;
        }

        .image-copy-line {
          width: 96px;
          height: 1px;
          background: rgba(255, 255, 255, 0.4);
        }

        .form-section {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 80px 56px;
          background: var(--background);
          overflow: hidden;
        }

        .form-wrap {
          width: 100%;
          max-width: 448px;
        }

        .form-header {
          margin-bottom: 28px;
        }

        .form-header h1 {
          margin: 0 0 8px;
          font-family: 'Raleway', sans-serif;
          font-size: 48px;
          line-height: 54px;
          font-weight: 300;
        }

        .form-header p {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 16px;
          line-height: 24px;
          font-weight: 300;
        }

        .signup-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .field {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field label {
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--on-surface-variant);
        }

        .field input,
        .field select {
          width: 100%;
          background: transparent;
          border: 0;
          border-bottom: 1px solid var(--outline-variant);
          padding: 10px 0;
          outline: none;
          color: var(--on-background);
          font-size: 16px;
          line-height: 24px;
        }

        .field input:focus,
        .field select:focus {
          border-bottom-color: var(--secondary);
        }

        .field input[aria-invalid="true"],
        .field select[aria-invalid="true"] {
          border-bottom-color: var(--error);
        }

        .field input[aria-invalid="true"]:focus,
        .field select[aria-invalid="true"]:focus {
          border-bottom-color: var(--error);
        }

        .field-error {
          margin: 0;
          color: var(--secondary);
          font-size: 12px;
          line-height: 18px;
          font-weight: 500;
        }

        .select-field select {
          appearance: none;
          -webkit-appearance: none;
        }

        .select-icon {
          pointer-events: none;
          position: absolute;
          right: 0;
          bottom: 10px;
          color: var(--on-surface-variant);
        }

        .submit-wrap {
          padding-top: 18px;
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

        .terms-text {
          margin: 18px 0 0;
          color: var(--on-surface-variant);
          font-size: 14px;
          line-height: 22px;
          font-weight: 300;
        }

        .terms-text a,
        .invite-text a {
          color: var(--primary);
          font-weight: 500;
        }

        .alternative-actions {
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
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

        .divider-row span,
        .form-footer p {
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.15em;
          font-weight: 600;
          color: rgba(75, 70, 61, 0.4);
          text-transform: uppercase;
        }

        .invite-text {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 14px;
          line-height: 22px;
          font-weight: 300;
        }

        .form-footer {
          margin-top: 24px;
          text-align: center;
          padding-bottom: 8px;
        }

        .form-footer p {
          margin: 0;
        }

        .floating-line {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        .floating-line div {
          width: 1px;
          height: 128px;
          background: linear-gradient(to bottom, transparent, rgba(206, 197, 185, 0.3), transparent);
        }

        @media (max-width: 767px) {
          .signup-page {
            height: calc(100dvh - 4.75rem);
            min-height: 0;
            overflow: hidden;
          }

          .image-section {
            display: none;
          }

          .form-section {
            width: 100%;
            min-height: 0;
            height: 100%;
            padding: 16px 20px;
          }

          .floating-line {
            display: none;
          }

          .form-header { margin-bottom: 14px; }
          .form-header h1 { font-size: 36px; line-height: 40px; }
          .signup-form { gap: 10px; }
          .field { gap: 3px; }
          .field input:not([type="checkbox"]), .field select { padding: 6px 0; line-height: 20px; }
          .password-toggle { margin-top: 2px; font-size: 10px; line-height: 14px; }
          .submit-wrap { padding-top: 4px; }
          .terms-text { margin-top: 8px; font-size: 12px; line-height: 17px; }
          .alternative-actions { margin-top: 10px; gap: 8px; }
          .invite-text { font-size: 12px; line-height: 18px; }
          .form-footer { margin-top: 10px; padding-bottom: 0; }
        }

        @media (min-width: 768px) and (max-height: 900px) {
          .form-section { padding: 16px clamp(32px, 5vw, 72px); }
          .form-header { margin-bottom: 14px; }
          .form-header h1 { font-size: 38px; line-height: 42px; }
          .signup-form { gap: 10px; }
          .field { gap: 3px; }
          .field input:not([type="checkbox"]), .field select { padding: 6px 0; line-height: 20px; }
          .password-toggle { margin-top: 2px; font-size: 10px; line-height: 14px; }
          .submit-wrap { padding-top: 4px; }
          .terms-text { margin-top: 8px; font-size: 12px; line-height: 17px; }
          .alternative-actions { margin-top: 10px; gap: 8px; }
          .invite-text { font-size: 12px; line-height: 18px; }
          .form-footer { margin-top: 10px; padding-bottom: 0; }
        }

        @media (min-width: 768px) and (max-height: 650px) {
          .form-section { padding-top: 8px; padding-bottom: 8px; }
          .form-header { margin-bottom: 8px; }
          .form-header h1 { font-size: 34px; line-height: 42px; }
          .signup-form { gap: 7px; }
          .field input:not([type="checkbox"]), .field select { padding: 4px 0; }
          .submit-wrap { padding-top: 2px; }
          .terms-text { margin-top: 5px; line-height: 16px; }
          .alternative-actions { margin-top: 6px; gap: 5px; }
          .form-footer { display: none; }
        }

        @media (max-width: 767px) and (max-height: 620px) {
          .form-section { padding-top: 8px; padding-bottom: 8px; }
          .form-header { margin-bottom: 8px; }
          .form-header h1 { font-size: 32px; line-height: 40px; }
          .signup-form { gap: 7px; }
          .field input:not([type="checkbox"]), .field select { padding: 4px 0; }
          .submit-wrap { padding-top: 2px; }
          .terms-text { margin-top: 5px; line-height: 16px; }
          .alternative-actions { margin-top: 6px; gap: 5px; }
          .form-footer { display: none; }
        }
      `}</style>

      <main className="signup-page">
        <section className="image-section cinematic-zoom">
          <Image
            className="desert-image"
            alt="A 4K desert landscape at sunrise."
            loading="eager"
            fetchPriority="high"
            fill
            quality={100}
            sizes="50vw"
            src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=3840&q=95"
          />

          <div className="image-gradient" />

          <div className="desktop-brand">
            <span className="brand-text">Tour ConnecTT</span>
          </div>

          <div className="image-copy">
            <h2>Serenity found in the vastness of the dunes.</h2>
            <div className="image-copy-line" />
          </div>
        </section>

        <section className="form-section">
          <div className="form-wrap">
            <header className="form-header">
              <h1>Operator Sign Up</h1>
              <p>Create your operator access profile.</p>
            </header>

            <SignupForm action={signUpOperatorAction} variant="operator" />

            <footer className="form-footer">
              <p>&copy; 2026 TOURCONNECTT. ALL RIGHTS RESERVED.</p>
            </footer>
          </div>
        </section>

        <div className="floating-line">
          <div />
        </div>
      </main>
    </PageShell>
  );
}
