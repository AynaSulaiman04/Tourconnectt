"use client";

import { useState } from "react";

type DocumentShareButtonProps = {
  documentId: string;
  documentName: string;
  className?: string;
};

export function DocumentShareButton({ documentId, documentName, className = "" }: DocumentShareButtonProps) {
  const [status, setStatus] = useState<{
    type: "idle" | "success" | "error" | "loading";
    message: string;
  }>({ type: "idle", message: "" });

  async function handleShare() {
    setStatus({ type: "loading", message: "Creating secure link..." });

    try {
      const response = await fetch(`/api/operator/documents/share-link?document_id=${encodeURIComponent(documentId)}`, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
        cache: "no-store",
      });

      const payload = (await response.json()) as { shareUrl?: string; error?: string };

      if (!response.ok || !payload.shareUrl) {
        throw new Error(payload.error ?? "Unable to create secure share link.");
      }

      const shareUrl = payload.shareUrl;

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        window.prompt("Copy this secure share link", shareUrl);
      }

      setStatus({ type: "success", message: `${documentName} secure share link copied.` });
    } catch {
      setStatus({
        type: "error",
        message: "We could not copy the secure link. Please try again.",
      });
    }
  }

  return (
    <div className={className}>
      <button className="btn-outline btn-sm" type="button" onClick={handleShare} disabled={status.type === "loading"}>
        <span className="material-symbols-outlined">share</span>
        {status.type === "loading" ? "Sharing..." : "Copy secure link"}
      </button>
      {status.message ? (
        <p
          className="mt-2 text-[12px] leading-5"
          style={{
            color: status.type === "error" ? "var(--secondary)" : "var(--on-surface-variant)",
          }}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
