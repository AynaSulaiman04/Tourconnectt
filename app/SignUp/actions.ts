"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { recordAdminNotifications } from "@/lib/supabase/notifications";
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

  if (normalized.includes("rate limit")) {
    return "Signups are temporarily rate limited by the auth provider. Please try again later.";
  }

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "That email is already registered. Try signing in instead.";
  }

  return message;
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

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role,
    },
  });

  if (createUserError) {
    return {
      ...initialSignupFormState,
      message: mapAuthError(createUserError.message),
      fieldErrors: {},
    } satisfies SignupFormState;
  }

  if (!createdUser.user) {
    return {
      ...initialSignupFormState,
      message: "We could not create your account. Please try again.",
      fieldErrors: {},
    } satisfies SignupFormState;
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: createdUser.user.id,
      email,
      full_name: fullName,
      preferred_inquiry_area: null,
      role,
    },
    {
      onConflict: "id",
    },
  );

  if (profileError) {
    return {
      ...initialSignupFormState,
      message: profileError.message,
      fieldErrors: {},
    } satisfies SignupFormState;
  }

  if (role !== "admin") {
    await recordAdminNotifications({
      actorProfileId: createdUser.user.id,
      excludeProfileId: createdUser.user.id,
      kind: "user_signed_up",
      title: "New user joined",
      body: `${fullName} created a ${role} account.`,
      href: `/AdminUsers?user=${createdUser.user.id}`,
      entityType: "profile",
      entityId: createdUser.user.id,
      metadata: {
        role,
        email,
      },
    }).catch((notificationError) => {
      console.error("Unable to record signup notification", {
        userId: createdUser.user.id,
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
  return runSignupAction("traveler", "/LoginPage?signup=success", formData);
}

export async function signUpOperatorAction(
  _state: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  return runSignupAction("operator", "/OperatorLogin?signup=success", formData);
}

export async function signUpAdminAction(
  _state: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  return runSignupAction("admin", "/AdminLogin?signup=success", formData);
}
