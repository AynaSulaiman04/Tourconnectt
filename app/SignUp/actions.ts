"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
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
  const supabase = await createSupabaseServerClient();
  const supabaseAdmin = createSupabaseServiceRoleClient();

  const { data: createdUser, error: createUserError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (createUserError) {
    return {
      ...initialSignupFormState,
      message: mapAuthError(createUserError.message),
      fieldErrors: {},
    } satisfies SignupFormState;
  }

  if (!createdUser.user || createdUser.user.identities?.length === 0) {
    return {
      ...initialSignupFormState,
      message: createdUser.user
        ? "That email is already registered. Try signing in instead."
        : "We could not create your account. Please try again.",
      fieldErrors: {},
    } satisfies SignupFormState;
  }

  const newUser = createdUser.user;
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

  if (role !== "admin" && newUser.email_confirmed_at) {
    await recordAdminNotifications({
      actorProfileId: newUser.id,
      excludeProfileId: newUser.id,
      kind: "user_signed_up",
      title: "New user joined",
      body: `${fullName} created a ${role} account.`,
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
