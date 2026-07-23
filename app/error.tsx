"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop py-10">
      <div className="glass-panel mx-auto max-w-3xl p-gutter">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-secondary" aria-hidden="true">
            error
          </span>
          <div className="space-y-3">
            <div>
              <div className="label-caps text-secondary mb-2">Something went wrong</div>
              <h1 className="section-title text-on-background">We could not load this page.</h1>
            </div>
            <p className="section-copy">
              Please try again in a moment. If the problem keeps happening, the platform may still be syncing data or a required integration may be unavailable.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={unstable_retry}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
