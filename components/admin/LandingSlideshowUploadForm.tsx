"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
/** Selection cap. Larger selections are split into batches automatically. */
const MAX_FILES_PER_SELECTION = 100;
/** Files sent per request. Matches the server's per-request cap. */
const FILES_PER_BATCH = 10;
/** Bytes per request, kept well under the server's 150 MB request ceiling. */
const MAX_BATCH_BYTES = 120 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

type UploadBatch = {
  files: File[];
  bytes: number;
};

/**
 * Groups a selection into requests that satisfy both the file-count and the
 * byte ceiling. A single file over the byte ceiling still gets its own batch so
 * the server, not the browser, reports the size error.
 */
function buildBatches(files: File[]): UploadBatch[] {
  const batches: UploadBatch[] = [];
  let current: UploadBatch = { files: [], bytes: 0 };

  for (const file of files) {
    const wouldExceedCount = current.files.length >= FILES_PER_BATCH;
    const wouldExceedBytes = current.files.length > 0 && current.bytes + file.size > MAX_BATCH_BYTES;

    if (wouldExceedCount || wouldExceedBytes) {
      batches.push(current);
      current = { files: [], bytes: 0 };
    }

    current.files.push(file);
    current.bytes += file.size;
  }

  if (current.files.length) {
    batches.push(current);
  }

  return batches;
}

export function LandingSlideshowUploadForm() {
  const router = useRouter();
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleUpload() {
    const files = Array.from(inputRef.current?.files ?? []);

    if (!files.length) {
      setStatus({ tone: "error", message: "Choose one or more image files first." });
      return;
    }

    if (files.length > MAX_FILES_PER_SELECTION) {
      setStatus({
        tone: "error",
        message: `Select up to ${MAX_FILES_PER_SELECTION} images at a time. You chose ${files.length}.`,
      });
      return;
    }

    const emptyFile = files.find((file) => file.size === 0);
    if (emptyFile) {
      setStatus({ tone: "error", message: `"${emptyFile.name}" is empty. Remove it and try again.` });
      return;
    }

    const wrongType = files.find((file) => !ALLOWED_MIME_TYPES.has(file.type));
    if (wrongType) {
      setStatus({
        tone: "error",
        message: `"${wrongType.name}" is not a JPG, PNG, WEBP, or AVIF image.`,
      });
      return;
    }

    const tooLarge = files.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setStatus({
        tone: "error",
        message: `"${tooLarge.name}" is ${(tooLarge.size / (1024 * 1024)).toFixed(1)} MB. Each image must be 25 MB or smaller.`,
      });
      return;
    }

    const batches = buildBatches(files);

    setIsUploading(true);
    setStatus(null);
    setProgress({ done: 0, total: files.length });

    let uploaded = 0;

    try {
      // Sequential batches. Parallel requests of this size compete for upload
      // bandwidth and make the progress count meaningless.
      for (const batch of batches) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 10 * 60 * 1000);

        try {
          const uploadData = new FormData();
          batch.files.forEach((file) => uploadData.append("landing_slideshow_uploads", file));

          const response = await fetch("/api/admin/settings/landing-slideshow", {
            method: "POST",
            body: uploadData,
            signal: controller.signal,
          });

          const payload = (await response.json().catch(() => null)) as { message?: string } | null;

          if (!response.ok) {
            throw new Error(
              payload?.message ||
                `Upload stopped after ${uploaded} of ${files.length} images. Please retry the rest.`,
            );
          }

          uploaded += batch.files.length;
          setProgress({ done: uploaded, total: files.length });
        } finally {
          window.clearTimeout(timeoutId);
        }
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setSelectedCount(0);
      setStatus({
        tone: "success",
        message: `${uploaded} slideshow image${uploaded === 1 ? "" : "s"} uploaded across ${batches.length} batch${batches.length === 1 ? "" : "es"}.`,
      });
      router.refresh();
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error && error.name === "AbortError"
            ? `The upload timed out after ${uploaded} of ${files.length} images. Check your connection and retry the rest.`
            : error instanceof Error
              ? error.message
              : "We could not upload the slideshow images.",
      });
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  }

  const percentage = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="grid min-w-0 gap-3">
      <label className="grid min-w-0 gap-2">
        <span className="text-sm text-on-surface-variant">Upload slideshow images</span>
        <input
          ref={inputRef}
          className="min-w-0 w-full max-w-full rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low/70 px-4 py-3 text-sm text-on-surface-variant file:mr-4 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-[0.68rem] file:font-bold file:uppercase file:tracking-[0.16em] file:text-white hover:border-outline-variant/40"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          name="landing_slideshow_uploads"
          type="file"
          onChange={(event) => {
            setStatus(null);
            setSelectedCount(event.target.files?.length ?? 0);
          }}
        />
        <span className="text-xs leading-5 text-on-surface-variant">
          JPG, PNG, WEBP, or AVIF. Select up to 100 at once &mdash; they upload in batches of 10 automatically.
          Each image up to 25 MB. Upload 4K originals (3840&nbsp;px wide or more); the site serves a sharp
          size for every screen.
        </span>
        {selectedCount > 0 && !isUploading ? (
          <span className="text-xs font-semibold text-secondary">
            {selectedCount} image{selectedCount === 1 ? "" : "s"} ready in{" "}
            {Math.ceil(selectedCount / FILES_PER_BATCH)} batch
            {Math.ceil(selectedCount / FILES_PER_BATCH) === 1 ? "" : "es"}.
          </span>
        ) : null}
      </label>

      {progress ? (
        <div className="grid gap-1">
          <div
            aria-label="Slideshow upload progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percentage}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-secondary transition-[width] duration-200"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-xs text-on-surface-variant">
            Uploaded {progress.done} of {progress.total}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button disabled={isUploading} type="button" variant="primary" onClick={handleUpload}>
          {isUploading ? "Uploading..." : "Upload images"}
        </Button>
      </div>

      {status ? (
        <p
          className={`text-sm leading-6 ${status.tone === "error" ? "text-error" : "text-on-surface-variant"}`}
          role="status"
          aria-live="polite"
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
