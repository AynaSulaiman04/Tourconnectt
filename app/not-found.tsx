import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="min-h-screen px-margin-mobile py-10 md:px-margin-desktop">
      <section className="glass-panel mx-auto max-w-3xl p-gutter">
        <p className="label-caps mb-2 text-secondary">404 · Page not found</p>
        <h1 className="section-title text-on-background">This route is not available.</h1>
        <p className="section-copy mt-3">
          The link may be outdated, or the requested record may no longer be available to this account.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button href="/" variant="primary">
            Return home
          </Button>
          <Button href="/Inquiry" variant="outline">
            Browse experiences
          </Button>
        </div>
      </section>
    </main>
  );
}
