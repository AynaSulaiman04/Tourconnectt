"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;
const MAX_BATCH_SIZE = 150 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function LandingSlideshowUploadForm() {
  const router = useRouter();
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleUpload() {
    const files = Array.from(inputRef.current?.files ?? []);

    if (!files.length) {
      setStatus({ tone: "error", message: "Choose one or more image files first." });
      return;
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      setStatus({ tone: "error", message: `Upload up to ${MAX_FILES_PER_UPLOAD} images at a time.` });
      return;
    }

    if (files.some((file) => file.size === 0)) {
      setStatus({ tone: "error", message: "One of the selected image files is empty. Choose a different file." });
      return;
    }

    if (files.some((file) => !ALLOWED_MIME_TYPES.has(file.type))) {
      setStatus({ tone: "error", message: "Only JPG, PNG, WEBP, or AVIF images are supported." });
      return;
    }

    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      setStatus({ tone: "error", message: "Each slideshow image must be 15 MB or smaller." });
      return;
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_BATCH_SIZE) {
      setStatus({ tone: "error", message: "This upload batch is too large. Please keep the total under 150 MB." });
      return;
    }

    setIsUploading(true);
    setStatus(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 90_000);

    try {
      const uploadData = new FormData();
      files.forEach((file) => uploadData.append("landing_slideshow_uploads", file));

      const response = await fetch("/api/admin/settings/landing-slideshow", {
        method: "POST",
        body: uploadData,
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message || "We could not upload the slideshow images.");
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setStatus({
        tone: "success",
        message: payload?.message || "Slideshow images uploaded.",
      });
      router.refresh();
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error && error.name === "AbortError"
            ? "The upload timed out. Check your connection and try again."
            : error instanceof Error
              ? error.message
              : "We could not upload the slideshow images.",
      });
    } finally {
      window.clearTimeout(timeoutId);
      setIsUploading(false);
    }
  }

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
          onChange={() => setStatus(null)}
        />
        <span className="text-xs leading-5 text-on-surface-variant">
          JPG, PNG, WEBP, or AVIF. Up to 10 images, 15 MB each and 150 MB total. Use 4K source files for best quality.
        </span>
      </label>

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
