"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useState } from "react";

export function LandingSlideshowUploadForm() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleUpload() {
    const files = Array.from(inputRef.current?.files ?? []).filter(
      (value): value is File => value instanceof File && value.size > 0 && value.type.startsWith("image/"),
    );

    if (!files.length) {
      setStatus("Choose one or more image files first.");
      return;
    }

    setIsUploading(true);
    setStatus(null);

    try {
      const uploadData = new FormData();
      files.forEach((file) => uploadData.append("landing_slideshow_uploads", file));

      const response = await fetch("/api/admin/settings/landing-slideshow", {
        method: "POST",
        body: uploadData,
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message || "We could not upload the slideshow images.");
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setStatus(payload?.message || "Slideshow images uploaded.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "We could not upload the slideshow images.");
    } finally {
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
          accept="image/*"
          multiple
          name="landing_slideshow_uploads"
          type="file"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={isUploading} type="button" onClick={handleUpload}>
          {isUploading ? "Uploading..." : "Upload Images"}
        </button>
      </div>

      {status ? <p className="text-sm leading-6 text-on-surface-variant">{status}</p> : null}
    </div>
  );
}
