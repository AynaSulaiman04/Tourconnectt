import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";

export default function PrivacyPolicyPage() {
  return (
    <PageShell variant="public">
      <main className="content-shell">
        <section className="card-surface px-gutter py-section-gap">
          <p className="section-eyebrow">Privacy Policy</p>
          <h1 className="section-title">How we handle traveler data.</h1>
          <p className="section-copy mt-4">
            Tour ConnecTT uses your account information, profile preferences, and inquiry activity only to deliver the traveler experience and support platform operations.
          </p>
          <p className="section-copy">
            Data stored in Supabase is used for authentication, profile editing, and journey coordination. We do not sell personal data.
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
