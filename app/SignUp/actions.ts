"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { recordAdminNotifications } from "@/lib/supabase/notifications";
import { sendSignupConfirmationEmail } from "@/lib/email/mailer";
import { initialSignupFormState, type SignupFormState } from "./types";

type AccountRole = "traveler" | "operator" | "admin";

const signupSchema = z.object({
  fullName: z
    .string({ error: "Enter your full name." })
    .trim()
    .min(2, { error: "Enter your full name." }),
  email: z
    .string({ error: "Enter a valid email address." })
    .trim()
    .email({ error: "Enter a valid email address." })
    .toLowerCase(),
  password: z
    .string({ error: "Choose a password." })
    .min(8, { error: "Use at least 8 characters." })
    .regex(/[A-Za-z]/, { error: "Include at least one letter." })
    .regex(/[0-9]/, { error: "Include at least one number." }),
});

function mapAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("already been registered")
  ) {
    return "That email is already registered. Try signing in instead.";
  }

  if (normalized.includes("rate limit")) {
    return "Signups are temporarily rate limited by the auth provider. Please try again in a few minutes.";
  }

  return message;
}

function getAppOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

async function runSignupAction(role: AccountRole, redirectTo: string, formData: FormData) {
  const validatedFields = signupSchema.safeParse({
    fullName: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return {
      ...initialSignupFormState,
      message: "Please review the highlighted fields.",
      fieldErrors: validatedFields.error.flatten().fieldErrors,
    } satisfies SignupFormState;
  }

  const { fullName, email, password } = validatedFields.data;
  const supabaseAdmin = createSupabaseServiceRoleClient();

  // The account is created through the admin API and the confirmation link is
  // generated here, rather than calling supabase.auth.signUp.
  //
  // signUp asks Supabase Auth to send the confirmation email itself, and its
  // built-in sender allows only a handful an hour. Once that cap is hit the
  // endpoint answers 429 over_email_send_rate_limit, and supabase-js reports
  // that as { user: null, error: null } — so signup failed with no usable
  // reason and no way for the caller to tell a quota problem from a real one.
  //
  // generateLink creates the user unconfirmed and hands back the action link,
  // which the platform's own SMTP delivers. Verification is still required;
  // only the delivery path changes.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      data: { full_name: fullName },
      redirectTo: `${getAppOrigin()}/auth/callback`,
    },
  });

  if (linkError) {
    return {
      ...initialSignupFormState,
      message: mapAuthError(linkError.message),
      fieldErrors: {},
    } satisfies SignupFormState;
  }

  const newUser = linkData?.user;
  const confirmationUrl = linkData?.properties?.action_link;

  if (!newUser || !confirmationUrl) {
    console.error("Signup link generation returned an incomplete result", {
      hasUser: Boolean(newUser),
      hasLink: Boolean(confirmationUrl),
    });

    return {
      ...initialSignupFormState,
      message: "We could not create your account. Please try again.",
      fieldErrors: {},
    } satisfies SignupFormState;
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: newUser.id,
      email,
      full_name: fullName,
      preferred_inquiry_area: null,
      role,
      is_active: true,
      status_reason: null,
    },
    {
      onConflict: "id",
    },
  );

  if (profileError) {
    const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(newUser.id);
    if (rollbackError) {
      console.error("Unable to roll back incomplete signup", {
        userId: newUser.id,
        code: rollbackError.status,
      });
    }

    return {
      ...initialSignupFormState,
      message: "We could not finish creating your account. Please try again.",
      fieldErrors: {},
    } satisfies SignupFormState;
  }

  // The account exists but is unconfirmed, so it cannot be signed in to until
  // this email arrives. If sending fails, remove the account rather than leave
  // the address stranded — a retry would otherwise report "already registered"
  // for an account its owner can never reach.
  const emailResult = await sendSignupConfirmationEmail({
    to: email,
    fullName,
    confirmationUrl,
  });

  if (!emailResult.ok) {
    console.error("Unable to send the signup confirmation email", {
      userId: newUser.id,
      error: emailResult.error,
    });

    const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(newUser.id);
    if (rollbackError) {
      console.error("Unable to roll back a signup whose confirmation email failed", {
        userId: newUser.id,
        code: rollbackError.status,
      });
    }

    return {
      ...initialSignupFormState,
      message:
        "We could not send your confirmation email, so the account was not created. Please check the address and try again.",
      fieldErrors: {},
    } satisfies SignupFormState;
  }

  // Previously gated on newUser.email_confirmed_at. Accounts are now created
  // unconfirmed by design, so that check was always false and admins stopped
  // being told about signups entirely. Notify on signup and say where the
  // account stands instead.
  if (role !== "admin") {
    await recordAdminNotifications({
      actorProfileId: newUser.id,
      excludeProfileId: newUser.id,
      kind: "user_signed_up",
      title: "New user joined",
      body: `${fullName} created a ${role} account and has been sent a confirmation email.`,
      href: `/AdminUsers?user=${newUser.id}`,
      entityType: "profile",
      entityId: newUser.id,
      metadata: {
        role,
        email,
      },
    }).catch((notificationError) => {
      console.error("Unable to record signup notification", {
        userId: newUser.id,
        role,
        error: notificationError,
      });
    });
  }

  redirect(redirectTo);
}

export async function signUpTravelerAction(
  _state: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  return runSignupAction("traveler", "/LoginPage?signup=check-email", formData);
}

export async function signUpOperatorAction(): Promise<SignupFormState> {
  return {
    ...initialSignupFormState,
    message: "Operator accounts are invite-only. Ask an administrator to grant operator access.",
    fieldErrors: {},
  };
}

export async function signUpAdminAction(): Promise<SignupFormState> {
  return {
    ...initialSignupFormState,
    message: "Administrator accounts are invite-only. Ask an existing administrator to grant access.",
    fieldErrors: {},
  };
}
