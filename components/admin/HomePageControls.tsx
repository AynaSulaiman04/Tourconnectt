import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { updateListingModerationAction } from "@/app/AdminListings/actions";
import { updateHomePageSettingsAction } from "@/app/AdminContent/actions";
import type { SiteContent } from "@/lib/site-content";

type FeaturedListing = {
  id: string;
  title: string;
  location: string | null;
  featured: boolean;
};

type HomePageControlsProps = {
  content: SiteContent;
  featuredListings: FeaturedListing[];
  liveListingCount: number;
};

export function HomePageControls({ content, featuredListings, liveListingCount }: HomePageControlsProps) {
  return (
    <GlassPanel className="p-gutter xl:col-span-12">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div>
          <div className="label-caps text-secondary mb-3">Home page</div>
          <h2 className="font-display text-[34px] leading-[1.05] tracking-[-0.04em] text-on-background">
            Hero, timing, and featured listings
          </h2>
          <p className="section-copy mt-2">
            Adjust the landing hero, rotation speed, and which live listings appear on the home page.
          </p>

          <form action={updateHomePageSettingsAction} className="mt-6 grid gap-5">
            <label className="grid gap-2">
              <span className="label-caps text-secondary">Hero eyebrow</span>
              <input
                className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
                defaultValue={content.heroEyebrow}
                name="heroEyebrow"
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="label-caps text-secondary">Hero prefix</span>
              <input
                className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
                defaultValue={content.heroPrefix}
                name="heroPrefix"
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="label-caps text-secondary">Rotating hero phrases</span>
              <textarea
                className="min-h-32 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
                defaultValue={content.heroPhrases}
                name="heroPhrases"
                placeholder="One phrase per line"
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="label-caps text-secondary">Hero description</span>
              <textarea
                className="min-h-24 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
                defaultValue={content.heroDescription}
                name="heroDescription"
                required
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2">
                <span className="label-caps text-secondary">Slideshow interval (ms)</span>
                <input
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
                  defaultValue={content.slideshowIntervalMs}
                  max={15000}
                  min={1500}
                  name="slideshowIntervalMs"
                  step={500}
                  type="number"
                  required
                />
              </label>
              <label className="grid gap-2">
                <span className="label-caps text-secondary">Hero rotation (ms)</span>
                <input
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
                  defaultValue={content.heroRotationMs}
                  max={15000}
                  min={1500}
                  name="heroRotationMs"
                  step={500}
                  type="number"
                  required
                />
              </label>
              <label className="grid gap-2">
                <span className="label-caps text-secondary">Notification poll (sec)</span>
                <input
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
                  defaultValue={content.notificationPollSeconds}
                  max={600}
                  min={15}
                  name="notificationPollSeconds"
                  step={15}
                  type="number"
                  required
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="primary">
                Save home settings
              </Button>
              <Button href="/AdminSettings#landing-slideshow" variant="outline">
                Manage slideshow images
              </Button>
              <Button href="/AdminListings?status=featured" variant="outline">
                Open featured listings
              </Button>
            </div>
          </form>
        </div>

        <div className="grid gap-4 content-start">
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 p-4">
            <div className="label-caps text-secondary mb-2">Featured on home</div>
            <p className="text-sm text-on-surface-variant">
              {featuredListings.length} featured · {liveListingCount} live listings available
            </p>
          </div>

          {featuredListings.length ? (
            featuredListings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container-low/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-body-md text-on-background">{listing.title}</div>
                  <div className="truncate text-sm text-on-surface-variant">{listing.location ?? "Location pending"}</div>
                </div>
                <form action={updateListingModerationAction}>
                  <input name="listing_id" type="hidden" value={listing.id} />
                  <input name="action" type="hidden" value="feature" />
                  <input name="return_to" type="hidden" value="/AdminContent" />
                  <Button type="submit" variant="outline" className="btn-sm">
                    Remove
                  </Button>
                </form>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-outline-variant/25 px-4 py-5 text-sm text-on-surface-variant">
              No featured listings yet. Feature live listings from the listings workspace.
            </div>
          )}

          <Button href="/AdminListings?status=live" variant="ghost" className="justify-center">
            Browse live listings to feature
          </Button>
        </div>
      </div>
    </GlassPanel>
  );
}
