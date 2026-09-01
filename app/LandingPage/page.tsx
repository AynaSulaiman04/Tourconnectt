import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { getLandingSlideshowImageUrls } from "@/lib/supabase/analytics";
import { dedupeSlideshowImageUrls, DEFAULT_LANDING_SLIDESHOW_IMAGES } from "@/lib/landing-slideshow-images";
import { getFeaturedInquiryListings } from "@/lib/supabase/inquiry";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { hasSupabaseSessionCookie } from "@/lib/supabase/session-cookie";
import { getSiteContent } from "@/lib/site-content";
import { getRequestLocale } from "@/lib/format/locale";
import { formatListingPrice } from "@/lib/format/listing-price";
import { getDefaultProfileImageUrl } from "@/lib/auth-hero-images";
import { getLandingHeroVideo } from "@/lib/supabase/landing-hero-video";
import { LandingPageView, type LandingTestimonial } from "./LandingPageView";

export const revalidate = 60;

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  traveler_id: string;
  created_at: string;
};

const LANDING_SHOWCASE_LIMIT = 24;
const DEFAULT_SHOWCASE_IMAGES = DEFAULT_LANDING_SLIDESHOW_IMAGES;

function isMissingRelationOrSchemaError(error: { code?: string | null; message?: string | null } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("Could not find the relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")),
  );
}

function settleWithTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 2000) {
  const wrapped = promise.then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const, value: fallback }));
  const timeout = new Promise<{ ok: false; value: T }>((resolve) => {
    setTimeout(() => resolve({ ok: false as const, value: fallback }), timeoutMs);
  });

  return Promise.race([wrapped, timeout]).then((result) => result.value);
}

async function loadLandingReviews() {
  try {
    const admin = createSupabaseServiceRoleClient();

    const { data, error } = await admin
      .from("reviews")
      .select("id,rating,comment,traveler_id,created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      if (isMissingRelationOrSchemaError(error) || error.message?.includes("terminated")) {
        return {
          testimonials: [] as LandingTestimonial[],
          reviewSummary: null as { averageRating: number; reviewCount: number } | null,
        };
      }

      return {
        testimonials: [] as LandingTestimonial[],
        reviewSummary: null as { averageRating: number; reviewCount: number } | null,
      };
    }

    const reviews = ((data ?? []) as ReviewRow[]).filter((review) => Number.isFinite(review.rating));

    if (!reviews.length) {
      return {
        testimonials: [] as LandingTestimonial[],
        reviewSummary: null as { averageRating: number; reviewCount: number } | null,
      };
    }

    const reviewSummary = {
      averageRating: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length,
      reviewCount: reviews.length,
    };

    const travelerIds = [...new Set(reviews.slice(0, 3).map((review) => review.traveler_id).filter(Boolean))];
    const nameByTravelerId = new Map<string, string>();

    if (travelerIds.length) {
      const { data: profiles, error: profileError } = await admin
        .from("profiles")
        .select("id,full_name")
        .in("id", travelerIds);

      if (!profileError || isMissingRelationOrSchemaError(profileError) || profileError.message?.includes("terminated")) {
        for (const profile of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
          nameByTravelerId.set(profile.id, profile.full_name?.trim() || "Verified traveller");
        }
      }
    }

    return {
      reviewSummary,
      testimonials: reviews.slice(0, 3).map((review, index) => ({
        id: review.id,
        text:
          review.comment?.trim() ||
          [
            "Every detail was exceptional. From the private guides to the seamless transfers, Tour ConnecTT delivered a journey we\'ll never forget.",
            "The heritage experiences were beyond incredible. Access we never could have arranged on our own.",
            "Impeccable planning and 24/7 support. Our family trip was effortless and absolutely magical.",
          ][index] ||
          "A memorable Tour ConnecTT journey.",
        name: nameByTravelerId.get(review.traveler_id) || `Traveller ${index + 1}`,
        location: "Verified traveller",
        avatarUrl: null,
        rating: review.rating,
      })) satisfies LandingTestimonial[],
    };
  } catch {
    return {
      testimonials: [] as LandingTestimonial[],
      reviewSummary: null as { averageRating: number; reviewCount: number } | null,
    };
  }
}

export default async function LandingPage() {
  const cookieStore = await cookies();
  const authFlow = cookieStore.get("tt-auth-flow")?.value;
  const hasSession = hasSupabaseSessionCookie(cookieStore.getAll());

  const [listings, landingReviews, showcaseImages, heroVideo, siteContent, profileContext, locale] = await Promise.all([
    settleWithTimeout(getFeaturedInquiryListings(3), [], 2000),
    settleWithTimeout(loadLandingReviews(), { testimonials: [] as LandingTestimonial[], reviewSummary: null }, 2000),
    settleWithTimeout(getLandingSlideshowImageUrls(), [], 2000),
    settleWithTimeout(getLandingHeroVideo(), null, 2000),
    getSiteContent(),
    hasSession ? getOptionalCurrentUserProfile() : Promise.resolve(null),
    getRequestLocale(),
  ]);
  const { testimonials, reviewSummary } = landingReviews;
  if (authFlow === "recovery" || authFlow === "magic_link") {
    const supabase = await createSupabaseServerClient();
    const { data: authData } = await supabase.auth.getUser();

    if (authData.user) {
      if (authFlow === "recovery") {
        redirect("/LoginPage?mode=recovery");
      }

      const admin = createSupabaseServiceRoleClient();
      const { data: profile } = await admin.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();

      redirect(getRoleDashboardRoute(profile?.role));
    }
  }

  const resolvedShowcaseImages = dedupeSlideshowImageUrls([
    ...showcaseImages,
    ...DEFAULT_SHOWCASE_IMAGES,
  ]).slice(0, LANDING_SHOWCASE_LIMIT);

  const defaultProfileImageUrl = profileContext?.profile
    ? await getDefaultProfileImageUrl(profileContext.profile.id)
    : null;

  return (
    <PageShell
      authResolved
      travelerProfile={
        profileContext?.profile
          ? {
              id: profileContext.profile.id,
              full_name: profileContext.profile.full_name,
              profile_image_url: profileContext.profile.profile_image_url ?? defaultProfileImageUrl,
              role: profileContext.profile.role,
            }
          : null
      }
      variant="public"
    >
      <LandingPageView
        listings={listings.map((listing) => ({
          id: listing.id,
          title: listing.title,
          location: listing.location ?? null,
          country: listing.country ?? null,
          duration: listing.duration ?? null,
          summary: listing.summary ?? null,
          imageUrl: listing.image_url ?? null,
          operatorName: listing.operator_name ?? null,
          price: formatListingPrice(listing.price, locale) ?? null,
          listingHref: `/Enquiry?listing=${listing.id}`,
        }))}
        reviewSummary={reviewSummary}
        testimonials={testimonials}
        showcaseImages={resolvedShowcaseImages}
        heroVideo={heroVideo ? { url: heroVideo.publicUrl, contentType: heroVideo.contentType } : null}
        siteContent={siteContent}
      />
    </PageShell>
  );
}
