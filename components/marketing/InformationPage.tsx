import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";

/**
 * Splits the stored copy into blocks on blank lines. Where a block has more
 * than one line, the first is treated as its heading - the convention every
 * one of these documents already follows. Previously the whole document was
 * dumped into a single <p> with `whitespace-pre-line`, so those headings read
 * as ordinary sentences and the page had no visible structure.
 */
function parseBody(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [first, ...rest] = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      return rest.length > 0
        ? { heading: first, paragraphs: rest }
        : { heading: null, paragraphs: [first] };
    });
}

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
          <div className="mt-8 max-w-[42rem] space-y-7">
            {parseBody(body).map((block, index) => (
              <div key={index} className="space-y-3">
                {block.heading ? (
                  <h2 className="info-block-heading">{block.heading}</h2>
                ) : null}
                {block.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className="section-copy">
                    {paragraph}
                  </p>
                ))}
              </div>
            ))}
          </div>
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
