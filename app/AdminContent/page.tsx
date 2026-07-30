import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { PageShell } from "@/components/layout/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { HomePageControls } from "@/components/admin/HomePageControls";
import { requireAdminProfile } from "@/lib/supabase/admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSiteContent } from "@/lib/site-content";
import { getFriendlyFeedbackMessage } from "@/lib/ui/feedback";
import { deleteReviewAction, resetSiteContentAction, updateReviewAction, updateSiteContentAction } from "./actions";
import { formatDate } from "@/lib/format/date";

type AdminContentPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type Review = { id: string; rating: number; comment: string | null; traveler_id: string; created_at: string };

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

export default async function AdminContentPage({ searchParams }: AdminContentPageProps) {
  await requireAdminProfile();
  const [content, params] = await Promise.all([getSiteContent(), searchParams]);
  const admin = createSupabaseServiceRoleClient();
  const [{ data: reviewsData }, { data: listingsData }] = await Promise.all([
    admin.from("reviews").select("id,rating,comment,traveler_id,created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("tour_listings").select("id,title,location,featured,status,is_active").order("updated_at", { ascending: false }).limit(100),
  ]);
  const reviews = (reviewsData ?? []) as Review[];
  const listings = listingsData ?? [];
  const featuredListings = listings.filter((listing) => listing.featured && listing.status === "live" && listing.is_active).slice(0, 6);
  const liveListingCount = listings.filter((listing) => listing.status === "live" && listing.is_active).length;
  const travelerIds = [...new Set(reviews.map((review) => review.traveler_id))];
  const { data: profiles } = travelerIds.length
    ? await admin.from("profiles").select("id,full_name,email").in("id", travelerIds)
    : { data: [] };
  const travelerById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const saved = typeof params.saved === "string";
  const savedMessage =
    params.saved === "home"
      ? "Home page settings saved."
      : params.saved === "content"
        ? "Public content saved."
        : params.saved === "reset"
          ? "Default copy restored."
          : saved
            ? "Changes saved successfully."
            : null;
  const actionError = getFriendlyFeedbackMessage(
    getParam(params.error),
    "That change could not be saved. Check the fields and try again.",
  );

  return (
    <PageShell variant="admin">
      <main className="portal-list-page">
        <SectionHeader
          level={1}
          eyebrow="Admin content"
          title="Home page and public content."
          description="Manage the landing hero, featured listings, slideshow timing, and approved public copy from one workspace."
          action={
            <Button href="/AdminSettings" variant="outline" className="gap-2">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                settings
              </span>
              Admin settings
            </Button>
          }
        />
        {savedMessage ? (
          <div className="mt-6">
            <StatusMessage tone="success">{savedMessage}</StatusMessage>
          </div>
        ) : null}
        {params.error ? (
          <div className="mt-6">
            <StatusMessage tone="error">{actionError}</StatusMessage>
          </div>
        ) : null}

        <section className="section-shell grid gap-8 xl:grid-cols-12 items-start">
          <HomePageControls
            content={content}
            featuredListings={featuredListings.map((listing) => ({
              id: listing.id,
              title: listing.title,
              location: listing.location,
              featured: listing.featured,
            }))}
            liveListingCount={liveListingCount}
          />

          <GlassPanel className="p-gutter xl:col-span-7">
            <div className="label-caps text-secondary mb-3">Footer and pages</div>
            <h2 className="font-display text-[34px] leading-[1.05] tracking-[-0.04em] text-on-background">Public content</h2>
            <form action={updateSiteContentAction} className="mt-6 grid gap-5">
              <label className="grid gap-2"><span className="label-caps text-secondary">Footer description</span><textarea className="min-h-24 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3" defaultValue={content.footerDescription} name="footerDescription" required /></label>
              {([
                ["howItWorks", "How it works"], ["aboutUs", "About us"], ["partners", "Partners"], ["careers", "Careers"], ["helpCenter", "Help center"], ["contactUs", "Contact us"],
              ] as const).map(([name, label]) => (
                <label className="grid gap-2" key={name}><span className="label-caps text-secondary">{label}</span><textarea className="min-h-32 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3" defaultValue={content[name]} name={name} required /></label>
              ))}
              <label className="grid gap-2"><span className="label-caps text-secondary">Contact email</span><input className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3" defaultValue={content.contactEmail} name="contactEmail" type="email" required /></label>
              <div className="flex flex-wrap gap-3"><Button type="submit" variant="primary">Save public content</Button></div>
            </form>
            <form action={resetSiteContentAction} className="mt-3"><Button type="submit" variant="outline">Restore default copy</Button></form>
          </GlassPanel>

          <div className="grid gap-5 xl:col-span-5">
            <div><div className="label-caps text-secondary mb-3">Reviews</div><h2 className="font-display text-[34px] leading-[1.05] tracking-[-0.04em] text-on-background">Traveller feedback</h2><p className="section-copy mt-2">Edit inaccurate content or remove reviews that should not appear publicly.</p></div>
            {reviews.length ? reviews.map((review) => {
              const traveler = travelerById.get(review.traveler_id);
              return <GlassPanel className="p-5" key={review.id}>
                <p className="text-sm text-on-surface-variant">{traveler?.full_name || traveler?.email || "Traveller"} · {formatDate(review.created_at)}</p>
                <form action={updateReviewAction} className="mt-4 grid gap-3">
                  <input name="review_id" type="hidden" value={review.id} />
                  <label className="grid gap-2"><span className="label-caps text-secondary">Rating</span><select className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3" defaultValue={review.rating} name="rating">{[5,4,3,2,1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
                  <label className="grid gap-2"><span className="label-caps text-secondary">Review</span><textarea className="min-h-28 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3" defaultValue={review.comment ?? ""} name="comment" /></label>
                  <Button type="submit" variant="primary">Save review</Button>
                </form>
                <form action={deleteReviewAction} className="mt-3"><input name="review_id" type="hidden" value={review.id} /><Button className="w-full justify-center" type="submit" variant="danger">Remove review</Button></form>
              </GlassPanel>;
            }) : <GlassPanel className="p-5"><p className="section-copy">No traveller reviews have been submitted yet.</p></GlassPanel>}
          </div>
        </section>
      </main>
    </PageShell>
  );
}
