import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";

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
          <h1 className="section-title">{title}</h1>
          <p className="section-copy mt-4 whitespace-pre-line">{body}</p>
          <div className="actions">
            <Link className="button primary" href={actionHref}>
              {actionLabel}
            </Link>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
