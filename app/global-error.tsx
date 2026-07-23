"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-screen bg-background text-on-background">
        <div className="min-h-screen px-margin-mobile md:px-margin-desktop py-10 flex items-center">
          <div className="glass-panel mx-auto max-w-3xl p-gutter">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                error
              </span>
              <div className="space-y-3">
                <div>
                  <div className="label-caps text-secondary mb-2">Platform error</div>
                  <h1 className="section-title text-on-background">Tour ConnecTT stopped unexpectedly.</h1>
                </div>
                <p className="section-copy">
                  Please try again. If the issue keeps happening, we may be missing a required setup step or an integration may be unavailable.
                </p>
                <button className="btn-primary" type="button" onClick={unstable_retry}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
