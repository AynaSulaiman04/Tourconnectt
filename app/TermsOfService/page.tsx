import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";

export default function TermsOfServicePage() {
  return (
    <PageShell variant="public">
      <main className="content-shell">
        <section className="card-surface px-gutter py-section-gap">
          <p className="section-eyebrow">Terms of Service</p>
          <h1 className="section-title">The working rules for Tour ConnecTT.</h1>
          <p className="section-copy mt-4">
            Accounts are intended for personal traveler use, profile editing, and inquiry management within the platform.
          </p>
          <p className="section-copy">
            You agree to keep your credentials secure, provide accurate profile information, and use the service in accordance with applicable laws and platform policies.
          </p>
          <div className="actions">
            <Link className="button primary" href="/">
              Back home
            </Link>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
