"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminProfile } from "@/lib/supabase/admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { DEFAULT_SITE_CONTENT, type SiteContent } from "@/lib/site-content";

const contentSchema = z.object({
  footerDescription: z.string().trim().min(10).max(240),
  howItWorks: z.string().trim().min(20).max(2000),
  aboutUs: z.string().trim().min(20).max(2000),
  partners: z.string().trim().min(20).max(2000),
  careers: z.string().trim().min(20).max(2000),
  helpCenter: z.string().trim().min(20).max(2000),
  contactUs: z.string().trim().min(20).max(2000),
  contactEmail: z.string().trim().email().max(200),
});

const reviewSchema = z.object({
  review_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000),
});

const CONTENT_PATHS = ["/LandingPage", "/HowItWorks", "/AboutUs", "/Partners", "/Careers", "/HelpCenter", "/ContactUs"];

export async function updateSiteContentAction(formData: FormData) {
  await requireAdminProfile();
  const parsed = contentSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/AdminContent?error=invalid-content");
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("admin_workspace_settings").upsert(
    { id: 1, site_content: parsed.data satisfies SiteContent },
    { onConflict: "id" },
  );

  if (error) {
    console.error("Unable to update site content", error.message);
    redirect("/AdminContent?error=content-save-failed");
  }

  CONTENT_PATHS.forEach((path) => revalidatePath(path));
  redirect("/AdminContent?saved=content");
}

export async function resetSiteContentAction() {
  await requireAdminProfile();
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("admin_workspace_settings").upsert(
    { id: 1, site_content: DEFAULT_SITE_CONTENT },
    { onConflict: "id" },
  );

  if (error) {
    redirect("/AdminContent?error=content-save-failed");
  }

  CONTENT_PATHS.forEach((path) => revalidatePath(path));
  redirect("/AdminContent?saved=reset");
}

export async function updateReviewAction(formData: FormData) {
  await requireAdminProfile();
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/AdminContent?error=invalid-review");
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("reviews")
    .update({ rating: parsed.data.rating, comment: parsed.data.comment || null })
    .eq("id", parsed.data.review_id);

  if (error) {
    redirect("/AdminContent?error=review-save-failed");
  }

  revalidatePath("/AdminContent");
  revalidatePath("/LandingPage");
  redirect("/AdminContent?saved=review");
}

export async function deleteReviewAction(formData: FormData) {
  await requireAdminProfile();
  const reviewId = z.string().uuid().safeParse(formData.get("review_id"));

  if (!reviewId.success) {
    redirect("/AdminContent?error=invalid-review");
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("reviews").delete().eq("id", reviewId.data);

  if (error) {
    redirect("/AdminContent?error=review-delete-failed");
  }

  revalidatePath("/AdminContent");
  revalidatePath("/LandingPage");
  redirect("/AdminContent?saved=review-deleted");
}
