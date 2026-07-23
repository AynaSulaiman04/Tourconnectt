import { redirect } from "next/navigation";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";

type AdminLoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const profileContext = await getOptionalCurrentUserProfile();

  if (profileContext?.profile) {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  const resolvedSearchParams = await searchParams;
  const suffix = new URLSearchParams();

  Object.entries(resolvedSearchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => suffix.append(key, item));
      return;
    }

    if (typeof value === "string" && value.length > 0) {
      suffix.set(key, value);
    }
  });

  suffix.set("mode", "admin");

  redirect(`/LoginPage?${suffix.toString()}`);
}
