import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdminProfile } from "@/lib/supabase/admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  LANDING_HERO_VIDEO_ALLOWED_MIME_TYPES,
  LANDING_HERO_VIDEO_BUCKET,
  LANDING_HERO_VIDEO_MAX_BYTES,
  LANDING_HERO_VIDEO_PREFIX,
  listLandingHeroVideos,
} from "@/lib/supabase/landing-hero-video";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_REQUEST_SIZE = LANDING_HERO_VIDEO_MAX_BYTES + 1024 * 1024;

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

/**
 * Returns null on success, or a message describing why storage is unusable.
 *
 * `fileSizeLimit` is attempted but not required: a bucket limit above the
 * project's global upload limit is rejected with a 413, which used to fail the
 * whole upload. The route validates the file size itself, so falling back to a
 * bucket with no explicit limit is safe.
 */
async function ensureHeroVideoBucket(admin: ReturnType<typeof createSupabaseServiceRoleClient>) {
  const allowedMimeTypes = [...LANDING_HERO_VIDEO_ALLOWED_MIME_TYPES];
  const withLimit = { public: true, allowedMimeTypes, fileSizeLimit: LANDING_HERO_VIDEO_MAX_BYTES };
  const withoutLimit = { public: true, allowedMimeTypes };

  const { data, error } = await admin.storage.getBucket(LANDING_HERO_VIDEO_BUCKET);
  const exists = Boolean(data) && !error;

  const apply = async (options: typeof withLimit | typeof withoutLimit) =>
    exists
      ? admin.storage.updateBucket(LANDING_HERO_VIDEO_BUCKET, options)
      : admin.storage.createBucket(LANDING_HERO_VIDEO_BUCKET, options);

  const first = await apply(withLimit);

  if (!first.error) {
    return null;
  }

  const fallback = await apply(withoutLimit);

  if (!fallback.error) {
    return null;
  }

  // "The resource already exists" means a concurrent request created it first,
  // which is a success for our purposes.
  if (fallback.error.message?.toLowerCase().includes("already exists")) {
    return null;
  }

  console.error("Unable to prepare hero video storage", {
    withLimit: first.error.message,
    withoutLimit: fallback.error.message,
  });

  return `We could not prepare hero video storage: ${fallback.error.message}`;
}

function refreshHeroVideoCaches() {
  revalidatePath("/");
  revalidatePath("/LandingPage");
  revalidatePath("/AdminSettings");
  revalidateTag("landing-hero-video", "max");
}

export async function POST(request: Request) {
  await requireAdminProfile();

  try {
    const declaredContentLength = Number(request.headers.get("content-length"));

    if (Number.isFinite(declaredContentLength) && declaredContentLength > MAX_REQUEST_SIZE) {
      return NextResponse.json(
        { message: "That video is too large. Please keep it under 50 MB." },
        { status: 413 },
      );
    }

    const formData = await request.formData();
    const file = formData
      .getAll("landing_hero_video")
      .find((value): value is File => value instanceof File && value.size > 0);

    if (!file) {
      return NextResponse.json({ message: "Choose a video file first." }, { status: 400 });
    }

    if (!LANDING_HERO_VIDEO_ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { message: "Only MP4, WebM, or QuickTime video files are supported." },
        { status: 400 },
      );
    }

    if (file.size > LANDING_HERO_VIDEO_MAX_BYTES) {
      return NextResponse.json(
        { message: "That video is too large. Please keep it under 50 MB." },
        { status: 413 },
      );
    }

    const admin = createSupabaseServiceRoleClient();
    const storageError = await ensureHeroVideoBucket(admin);

    if (storageError) {
      return NextResponse.json({ message: storageError }, { status: 500 });
    }

    const filePath = `${LANDING_HERO_VIDEO_PREFIX}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name || "hero")}`;
    const { error: uploadError } = await admin.storage.from(LANDING_HERO_VIDEO_BUCKET).upload(filePath, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "31536000",
    });

    if (uploadError) {
      return NextResponse.json({ message: uploadError.message }, { status: 500 });
    }

    // Only the newest video is ever played. Drop the superseded ones so the
    // bucket does not accumulate large files the site will never serve.
    const existing = await listLandingHeroVideos();
    const stalePaths = existing.map((video) => video.path).filter((path) => path !== filePath);

    if (stalePaths.length) {
      await admin.storage.from(LANDING_HERO_VIDEO_BUCKET).remove(stalePaths);
    }

    refreshHeroVideoCaches();

    return NextResponse.json({ message: "Hero video uploaded. It is now playing behind the home page hero." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "We could not upload the hero video." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  await requireAdminProfile();

  try {
    const existing = await listLandingHeroVideos();

    if (!existing.length) {
      return NextResponse.json({ message: "There is no hero video to remove." }, { status: 400 });
    }

    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin.storage
      .from(LANDING_HERO_VIDEO_BUCKET)
      .remove(existing.map((video) => video.path));

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    refreshHeroVideoCaches();

    return NextResponse.json({ message: "Hero video removed. The home page hero is back to its still design." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "We could not remove the hero video." },
      { status: 500 },
    );
  }
}
