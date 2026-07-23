"use client";

import { useState } from "react";

type CalendarFeedCopyButtonProps = {
  feedUrl: string;
};

export function CalendarFeedCopyButton({ feedUrl }: CalendarFeedCopyButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  return (
    <div className="space-y-2">
      <button
        className="btn-outline btn-sm"
        type="button"
        onClick={handleCopy}
      >
        Copy iCal Feed Link
      </button>
      {status === "copied" ? (
        <p className="text-xs text-secondary">Feed link copied.</p>
      ) : null}
      {status === "error" ? (
        <p className="text-xs text-error">Unable to copy the feed link.</p>
      ) : null}
    </div>
  );
}
