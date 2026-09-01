import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";

type InformationPageProps = {
  eyebrow: string;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
};

export function InformationPage({
  eyebrow,
  title,
  body,
  actionHref = "/LandingPage",
  actionLabel = "Back home",
}: InformationPageProps) {
  return (
    <PageShell variant="public">
      <main className="content-shell">
        <section className="card-surface px-gutter py-section-gap">
          <p className="section-eyebrow">{eyebrow}</p>
          {/* Capped for readability: the card runs the full content width, which
              is far too long a measure for body copy. */}
          <h1 className="section-title max-w-[46rem]">{title}</h1>
          <p className="section-copy mt-6 max-w-[42rem] whitespace-pre-line">{body}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href={actionHref} variant="primary">
              {actionLabel}
            </Button>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
