import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_ACCOUNT_PASSWORD;

if (!supabaseUrl || !serviceRoleKey || !password) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or DEMO_ACCOUNT_PASSWORD.",
  );
}

if (password.length < 12) {
  throw new Error("DEMO_ACCOUNT_PASSWORD must contain at least 12 characters.");
}

const accounts = [
  {
    email: process.env.DEMO_TRAVELER_EMAIL ?? "traveler.demo@tourconnectt.test",
    fullName: process.env.DEMO_TRAVELER_NAME ?? "Demo Traveler",
    role: "traveler",
  },
  {
    email: process.env.DEMO_OPERATOR_EMAIL ?? "operator.demo@tourconnectt.test",
    fullName: process.env.DEMO_OPERATOR_NAME ?? "Demo Operator",
    role: "operator",
  },
  {
    email: process.env.DEMO_ADMIN_EMAIL ?? "admin.demo@tourconnectt.test",
    fullName: process.env.DEMO_ADMIN_NAME ?? "Demo Administrator",
    role: "admin",
  },
];

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) {
  throw listError;
}

for (const account of accounts) {
  const existingUser =
    existingUsers.users.find(
      (user) => user.email?.toLowerCase() === account.email.toLowerCase(),
    ) ?? null;

  let userId = existingUser?.id ?? null;

  if (existingUser) {
    const { error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata ?? {}),
        full_name: account.fullName,
        role: account.role,
      },
    });

    if (error) {
      throw error;
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: account.fullName,
        role: account.role,
      },
    });

    if (error) {
      throw error;
    }

    userId = data.user?.id ?? null;
  }

  if (!userId) {
    throw new Error(`Unable to resolve the ${account.role} demo user ID.`);
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: account.email,
      full_name: account.fullName,
      preferred_inquiry_area: null,
      role: account.role,
      is_active: true,
      status_reason: null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileError) {
    throw profileError;
  }

  console.log(`${account.role}: ${account.email}`);
}

console.log("Demo accounts are ready. The shared password was read from DEMO_ACCOUNT_PASSWORD.");
