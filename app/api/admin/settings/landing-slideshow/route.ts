import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/supabase/admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const LANDING_SLIDESHOW_BUCKET = "landing-slideshow";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;
const MAX_BATCH_SIZE = 25 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_BATCH_SIZE + 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function ensureLandingSlideshowBucket(admin: ReturnType<typeof createSupabaseServiceRoleClient>) {
  const { data, error } = await admin.storage.getBucket(LANDING_SLIDESHOW_BUCKET);

  if (data && !error) {
    const { error: updateError } = await admin.storage.updateBucket(LANDING_SLIDESHOW_BUCKET, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    });

    if (updateError) {
      return false;
    }

    return true;
  }

  const { error: createError } = await admin.storage.createBucket(LANDING_SLIDESHOW_BUCKET, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
  });

  return !createError;
}

async function uploadFilesInBatches(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  files: File[],
  batchSize = 4,
) {
  for (let index = 0; index < files.length; index += batchSize) {
    const currentBatch = files.slice(index, index + batchSize);

    await Promise.all(
      currentBatch.map(async (file) => {
        const filePath = `admin/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name || "slide")}`;
        const { error: uploadError } = await admin.storage.from(LANDING_SLIDESHOW_BUCKET).upload(filePath, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "31536000",
        });

        if (uploadError) {
          throw new Error(uploadError.message);
        }
      }),
    );
  }
}

export async function POST(request: Request) {
  await requireAdminProfile();

  try {
    const declaredContentLength = Number(request.headers.get("content-length"));

    if (Number.isFinite(declaredContentLength) && declaredContentLength > MAX_REQUEST_SIZE) {
      return NextResponse.json(
        { message: "This upload batch is too large. Please keep the total under 25 MB." },
        { status: 413 },
      );
    }

    const formData = await request.formData();
    const files = formData
      .getAll("landing_slideshow_uploads")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!files.length) {
      return NextResponse.json({ message: "Choose one or more image files first." }, { status: 400 });
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      return NextResponse.json(
        { message: `Upload up to ${MAX_FILES_PER_UPLOAD} images at a time.` },
        { status: 400 },
      );
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

    if (totalBytes > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { message: "This upload batch is too large. Please keep the total under 25 MB." },
        { status: 413 },
      );
    }

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return NextResponse.json(
          { message: "Only JPG, PNG, WEBP, or AVIF images are supported." },
          { status: 400 },
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { message: "Each slideshow image must be 5 MB or smaller." },
          { status: 413 },
        );
      }
    }

    const admin = createSupabaseServiceRoleClient();
    const bucketReady = await ensureLandingSlideshowBucket(admin);

    if (!bucketReady) {
      return NextResponse.json(
        { message: "We could not prepare slideshow storage. Please try again." },
        { status: 500 },
      );
    }

    await uploadFilesInBatches(admin, files);

    revalidatePath("/");
    revalidatePath("/LandingPage");
    revalidatePath("/AdminSettings");

    return NextResponse.json({
      message: `${files.length} slideshow image${files.length === 1 ? "" : "s"} uploaded.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "We could not upload the slideshow images.",
      },
      { status: 500 },
    );
  }
}
