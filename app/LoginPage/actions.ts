"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getRoleDashboardRoute } from "@/lib/supabase/profile";
import { clearPortalAuthCookie } from "@/lib/supabase/portal-auth";
import { initialLoginFormState, type LoginFormState } from "./types";
import { initialRecoveryFormState, type RecoveryFormState } from "./recovery-types";
import { initialForgotPasswordFormState, type ForgotPasswordFormState } from "./forgot-password-types";

const loginSchema = z.object({
  email: z.string({ error: "Enter a valid email address." }).trim().email({ error: "Enter a valid email address." }).toLowerCase(),
  password: z.string({ error: "Enter your password." }).min(1, { error: "Enter your password." }),
});

const emailOnlySchema = z.object({
  email: z
    .string({ error: "Enter a valid email address." })
    .trim()
    .email({ error: "Enter a valid email address." })
    .toLowerCase(),
});

const recoveryPasswordSchema = z.object({
  password: z
    .string({ error: "Choose a password." })
    .min(8, { error: "Use at least 8 characters." })
    .regex(/[A-Za-z]/, { error: "Include at least one letter." })
    .regex(/[0-9]/, { error: "Include at least one number." }),
  confirmPassword: z
    .string({ error: "Confirm your password." })
    .min(1, { error: "Confirm your password." }),
});

function mapAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Username and password are incorrect.";
  }

  if (normalized.includes("rate limit")) {
    return "Login is temporarily rate limited. Please try again shortly.";
  }

  return message;
}

function mapPasswordResetError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("rate limit")) {
    return "A reset link was requested recently. Check your inbox first, or try again in a few minutes.";
  }

  return mapAuthError(message);
}

function getLoginFieldErrors(message: string): LoginFormState["fieldErrors"] {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    const fieldError = "Username and password are incorrect.";
    return {
      email: [fieldError],
      password: [fieldError],
    };
  }

  return {};
}

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? "http";

  if (requestHeaders.get("origin")) {
    return requestHeaders.get("origin") as string;
  }

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return "http://localhost:3000";
}

function buildCallbackUrl(origin: string, nextPath: string) {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", nextPath);
  return url.toString();
}

function withWelcomeBackMessage(state: ForgotPasswordFormState): ForgotPasswordFormState {
  return {
    ...state,
    success: true,
    message: "We sent a reset link to your email. Use it to set a new password.",
  };
}

function getExpectedRole(formData: FormData): "traveler" | "operator" | "admin" | null {
  const value = String(formData.get("expected_role") ?? "").trim();

  if (value === "traveler" || value === "operator" || value === "admin") {
    return value;
  }

  return null;
}

export async function loginAction(
  _state: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const validatedFields = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return {
      ...initialLoginFormState,
      message: "Please review the highlighted fields.",
      fieldErrors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseServiceRoleClient();
  const { email, password } = validatedFields.data;
  const expectedRole = getExpectedRole(formData);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await clearPortalAuthCookie(await cookies());
    const errorMessage = mapAuthError(error?.message ?? "Unable to sign in.");
    return {
      ...initialLoginFormState,
      message: errorMessage,
      fieldErrors: getLoginFieldErrors(error?.message ?? errorMessage),
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role,full_name,is_active,status_reason")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    await clearPortalAuthCookie(await cookies());

    return {
      ...initialLoginFormState,
      message: "We could not load your account profile. Please try again.",
      fieldErrors: {
        email: ["Account profile not found."],
        password: ["Account profile not found."],
      },
    };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    await clearPortalAuthCookie(await cookies());

    return {
      ...initialLoginFormState,
      message: profile.status_reason || "This account is not currently active. Contact an administrator.",
      fieldErrors: {
        email: ["Account access is disabled."],
        password: ["Account access is disabled."],
      },
    };
  }

  if (expectedRole === "traveler" && profile?.role && profile.role !== "traveler") {
    await supabase.auth.signOut();
    await clearPortalAuthCookie(await cookies());

    return {
      ...initialLoginFormState,
      message: "This sign-in is reserved for traveller accounts. Please use the traveller login.",
      fieldErrors: {
        email: ["Please use the traveller login."],
        password: ["Please use the traveller login."],
      },
    };
  }

  if (expectedRole && expectedRole !== "traveler" && profile?.role && profile.role !== expectedRole) {
    await supabase.auth.signOut();
    await clearPortalAuthCookie(await cookies());

    return {
      ...initialLoginFormState,
      message:
        expectedRole === "operator"
          ? "This sign-in is reserved for operator accounts. Please use an operator account."
          : "This sign-in is reserved for admin accounts. Please use an admin account.",
      fieldErrors: {
        email: ["Please use the correct account role."],
        password: ["Please use the correct account role."],
      },
    };
  }

  await admin
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.user.id);

  redirect(getRoleDashboardRoute(profile.role));
}

export async function requestPasswordResetAction(
  _state: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const validatedFields = emailOnlySchema.safeParse({
    email: formData.get("email"),
  });

  if (!validatedFields.success) {
    return {
      ...initialForgotPasswordFormState,
      message: "Please review the highlighted fields.",
      fieldErrors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const redirectTo = buildCallbackUrl(await getRequestOrigin(), "/LoginPage?mode=recovery");

  const { error } = await supabase.auth.resetPasswordForEmail(validatedFields.data.email, {
    redirectTo,
  });

  if (error) {
    return {
      ...initialForgotPasswordFormState,
      message: mapPasswordResetError(error.message),
      fieldErrors: {},
    };
  }

  return withWelcomeBackMessage(initialForgotPasswordFormState);
}

export async function updatePasswordAction(
  _state: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const validatedFields = recoveryPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirm_password"),
  });

  if (!validatedFields.success) {
    return {
      ...initialRecoveryFormState,
      message: "Please review the highlighted fields.",
      fieldErrors: validatedFields.error.flatten().fieldErrors,
    };
  }

  if (validatedFields.data.password !== validatedFields.data.confirmPassword) {
    return {
      ...initialRecoveryFormState,
      message: "Passwords do not match.",
      fieldErrors: {
        confirmPassword: ["Passwords do not match."],
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return {
      ...initialRecoveryFormState,
      message: "Your recovery session expired. Please request a new link.",
      fieldErrors: {},
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: validatedFields.data.password,
  });

  if (error) {
    return {
      ...initialRecoveryFormState,
      message: mapAuthError(error.message),
      fieldErrors: {},
    };
  }

  redirect("/TravellerProfile");
}
