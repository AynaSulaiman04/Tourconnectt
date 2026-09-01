"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

type LandingHeroVideoFormProps = {
  currentVideoUrl: string | null;
  currentVideoSizeBytes: number | null;
};

function formatMegabytes(bytes: number | null) {
  if (!bytes) {
    return null;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LandingHeroVideoForm({ currentVideoUrl, currentVideoSizeBytes }: LandingHeroVideoFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];

    if (!file) {
      setStatus({ tone: "error", message: "Choose a video file first." });
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setStatus({ tone: "error", message: "Only MP4, WebM, or QuickTime video files are supported." });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setStatus({
        tone: "error",
        message: `That video is ${formatMegabytes(file.size)}. Please keep it under 50 MB.`,
      });
      return;
    }

    setBusy("upload");
    setStatus(null);
    setProgress(0);

    try {
      // XMLHttpRequest rather than fetch: a multi-megabyte upload needs real progress,
      // and fetch cannot report request-body progress.
      await new Promise<void>((resolve, reject) => {
        const uploadData = new FormData();
        uploadData.append("landing_hero_video", file);

        const request = new XMLHttpRequest();
        request.open("POST", "/api/admin/settings/landing-hero-video");
        request.timeout = 15 * 60 * 1000;

        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        request.addEventListener("load", () => {
          let payload: { message?: string } | null = null;

          try {
            payload = JSON.parse(request.responseText) as { message?: string };
          } catch {
            payload = null;
          }

          if (request.status >= 200 && request.status < 300) {
            setStatus({
              tone: "success",
              message: payload?.message || "Hero video uploaded.",
            });
            resolve();
            return;
          }

          reject(new Error(payload?.message || "We could not upload the hero video."));
        });

        request.addEventListener("error", () => reject(new Error("The upload failed. Check your connection and try again.")));
        request.addEventListener("timeout", () => reject(new Error("The upload timed out. Try a smaller or more compressed file.")));
        request.addEventListener("abort", () => reject(new Error("The upload was cancelled.")));

        request.send(uploadData);
      });

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      router.refresh();
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "We could not upload the hero video.",
      });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function handleRemove() {
    setBusy("remove");
    setStatus(null);

    try {
      const response = await fetch("/api/admin/settings/landing-hero-video", { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message || "We could not remove the hero video.");
      }

      setStatus({ tone: "success", message: payload?.message || "Hero video removed." });
      router.refresh();
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "We could not remove the hero video.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      {currentVideoUrl ? (
        <div className="grid gap-2">
          <span className="text-sm text-on-surface-variant">
            Currently playing behind the home page hero
            {currentVideoSizeBytes ? ` (${formatMegabytes(currentVideoSizeBytes)})` : ""}
          </span>
          <video
            className="w-full max-w-md rounded-2xl border border-outline-variant/20"
            controls
            muted
            playsInline
            preload="metadata"
            src={currentVideoUrl}
          />
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">
          No hero video yet. The home page hero shows its still design until you upload one.
        </p>
      )}

      <label className="grid min-w-0 gap-2">
        <span className="text-sm text-on-surface-variant">Upload hero background video</span>
        <input
          ref={inputRef}
          className="min-w-0 w-full max-w-full rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low/70 px-4 py-3 text-sm text-on-surface-variant file:mr-4 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-[0.68rem] file:font-bold file:uppercase file:tracking-[0.16em] file:text-white hover:border-outline-variant/40"
          accept="video/mp4,video/webm,video/quicktime"
          name="landing_hero_video"
          type="file"
          onChange={() => setStatus(null)}
        />
        <span className="text-xs leading-5 text-on-surface-variant">
          MP4 or WebM, up to 50 MB. It plays muted and on loop, so a 10&ndash;30 second clip with no audio
          works best. Uploading replaces the current video.
        </span>
      </label>

      {progress !== null ? (
        <div className="grid gap-1">
          <div
            aria-label="Hero video upload progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-secondary transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-on-surface-variant">Uploading {progress}%</span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button disabled={busy !== null} type="button" variant="primary" onClick={handleUpload}>
          {busy === "upload" ? "Uploading..." : currentVideoUrl ? "Replace video" : "Upload video"}
        </Button>
        {currentVideoUrl ? (
          <Button disabled={busy !== null} type="button" variant="outline" onClick={handleRemove}>
            {busy === "remove" ? "Removing..." : "Remove video"}
          </Button>
        ) : null}
      </div>

      {status ? (
        <p
          aria-live="polite"
          className={`text-sm leading-6 ${status.tone === "error" ? "text-error" : "text-on-surface-variant"}`}
          role="status"
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
