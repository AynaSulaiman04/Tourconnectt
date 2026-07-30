import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LoginForm } from "./login-form";
import { ForgotPasswordForm } from "./forgot-password-form";
import { RecoveryForm } from "./recovery-form";
import { PageShell } from "@/components/layout/PageShell";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { getAuthHeroImages } from "@/lib/auth-hero-images";

type LoginPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
    signup?: string | string[];
    auth?: string | string[];
    redirect?: string | string[];
    expected_role?: string | string[];
    reason?: string | string[];
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
  const profileContext = await getOptionalCurrentUserProfile();

  if (profileContext?.profile) {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
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
  const inactiveReason = Array.isArray(resolvedSearchParams.reason)
    ? resolvedSearchParams.reason[0]
    : resolvedSearchParams.reason;
  const initialBanner =
    signupStatus === "success"
      ? {
          message: "Your account is ready. Sign in with your email and password.",
          success: true,
        }
      : signupStatus === "check-email"
        ? {
            message: "Account created. Check your email and confirm your address before signing in.",
            success: true,
          }
        : signupStatus === "invite-only"
          ? {
              message: `${isOperatorMode ? "Operator" : "Administrator"} accounts are invite-only. Ask an administrator for access.`,
              success: false,
            }
          : authStatus === "error"
            ? {
                message: "We could not complete the secure sign-in link. Please try again.",
                success: false,
              }
            : authStatus === "inactive"
              ? {
                  message:
                    inactiveReason?.trim() ||
                    "This account is not currently active. Contact an administrator.",
                  success: false,
                }
              : null;

  const pageTitle = isRecoveryMode
    ? "Reset Password"
    : isForgotMode
      ? "Forgot Password"
      : isAdminMode
        ? "Admin Login"
        : isOperatorMode
          ? "Operator Login"
          : "Login";

  const pageDescription = isRecoveryMode
    ? "Choose a new password for your traveller account."
    : isForgotMode
      ? "Enter the email tied to your account and we will send a reset link."
      : isAdminMode
        ? "Enter your administrator credentials to access the admin dashboard."
        : isOperatorMode
          ? "Enter your operator credentials to access the operator dashboard."
          : "Enter your credentials to access your private collection.";

  const heroTitle =
    isRecoveryMode || isForgotMode
      ? "Secure access to your Tour ConnecTT account."
      : "Return to the warmth, culture, and coastlines of the Caribbean.";

  const heroImages = await getAuthHeroImages();

  return (
    <PageShell authResolved variant="public">
      <AuthPageLayout
        description={pageDescription}
        heroImages={heroImages}
        heroTitle={heroTitle}
        title={pageTitle}
        footer={
          <p>
            &copy; 2026 Tour ConnecTT. All rights reserved.{" "}
            <Link href="/PrivacyPolicy">Privacy Policy</Link> ·{" "}
            <Link href="/TermsOfService">Terms of Service</Link>
          </p>
        }
      >
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
      </AuthPageLayout>
    </PageShell>
  );
}
