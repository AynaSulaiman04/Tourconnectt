import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";

export default function PrivacyPolicyPage() {
  return (
    <PageShell variant="public">
      <main className="content-shell">
        <section className="card-surface px-gutter py-section-gap">
          <p className="section-eyebrow">Privacy Policy</p>
          <h1 className="section-title">How we handle traveller data.</h1>
          <p className="section-copy mt-4">
            Tour ConnecTT uses your account information, profile preferences, and enquiry activity only to deliver the traveller experience and support platform operations.
          </p>
          <p className="section-copy">
            Data stored in Supabase is used for authentication, profile editing, and journey coordination. We do not sell personal data.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button href="/" variant="primary">
              Back home
            </Button>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
