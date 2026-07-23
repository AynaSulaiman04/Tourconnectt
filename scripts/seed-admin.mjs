import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_FULL_NAME ?? "TT Connect Admin";

if (!supabaseUrl || !serviceRoleKey || !email || !password) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, or ADMIN_PASSWORD.",
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey);

const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers();

if (listError) {
  throw listError;
}

const existingUser = existingUsers.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;

let userId = existingUser?.id ?? null;

if (!existingUser) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: "admin",
    },
  });

  if (error) {
    throw error;
  }

  userId = data.user?.id ?? null;
} else {
  const { error } = await admin.auth.admin.updateUserById(existingUser.id, {
    password,
    user_metadata: {
      ...(existingUser.user_metadata ?? {}),
      full_name: fullName,
      role: "admin",
    },
  });

  if (error) {
    throw error;
  }
}

if (!userId) {
  throw new Error("Unable to resolve admin user id.");
}

const { error: profileError } = await admin.from("profiles").upsert(
  {
    id: userId,
    email,
    full_name: fullName,
    preferred_inquiry_area: null,
    role: "admin",
    is_active: true,
    status_reason: null,
    last_seen_at: new Date().toISOString(),
  },
  { onConflict: "id" },
);

if (profileError) {
  throw profileError;
}

console.log(`Admin account ready: ${email}`);
