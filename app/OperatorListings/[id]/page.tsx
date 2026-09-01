import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { getRoleDashboardRoute } from "@/lib/supabase/profile";
import { getOperatorListingById } from "@/lib/supabase/operator-listings";
import { requireOperatorProfile } from "@/lib/supabase/operator";
import { formatListingPrice } from "@/lib/format/listing-price";

type OperatorListingViewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function OperatorListingViewPage({ params }: OperatorListingViewPageProps) {
  const resolvedParams = await params;
  const operatorProfile = await requireOperatorProfile();
  const listing = await getOperatorListingById(operatorProfile.id, resolvedParams.id);

  if (!listing) {
    redirect(getRoleDashboardRoute(operatorProfile.role));
  }

  return (
    <PageShell variant="operator">
      <style>{`
        .listing-view-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(167, 67, 31, 0.04), transparent 28%),
            radial-gradient(circle at top right, rgba(111, 98, 73, 0.035), transparent 30%),
            var(--background);
          color: var(--on-surface);
        }

        .listing-view-wrap {
          max-width: 1280px;
          margin: 0 auto;
          padding: 112px 24px 120px;
        }

        .listing-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(320px, 0.88fr);
          gap: 24px;
          align-items: start;
        }

        .listing-image {
          position: relative;
          min-height: 540px;
          overflow: hidden;
        }

        .listing-image img {
          object-fit: cover;
        }

        .listing-copy {
          display: grid;
          gap: 24px;
        }

        .meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .meta-pill {
          display: inline-flex;
          align-items: center;
          padding: 0.45rem 0.8rem;
          border-radius: 999px;
          border: 1px solid rgba(167, 67, 31, 0.16);
          background: rgba(255, 253, 251, 0.7);
          color: var(--secondary);
          font-size: 10px;
          line-height: 16px;
          letter-spacing: 0.16em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .title {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(3rem, 5vw, 5rem);
          line-height: 0.94;
          letter-spacing: -0.04em;
          font-weight: 300;
          text-transform: lowercase;
        }

        .copy {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 18px;
          line-height: 28px;
          font-weight: 300;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .detail-card {
          padding: 18px;
        }

        .detail-card p {
          margin: 0;
        }

        .detail-card p:first-child {
          color: var(--on-surface-variant);
          font-size: 11px;
          line-height: 16px;
          letter-spacing: 0.16em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .detail-card p:last-child {
          margin-top: 8px;
          color: var(--on-surface);
          font-size: 16px;
          line-height: 24px;
          font-weight: 300;
        }

        .back-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        @media (max-width: 1100px) {
          .listing-grid {
            grid-template-columns: 1fr;
          }

          .listing-image {
            min-height: 360px;
          }
        }
      `}</style>

      <main className="listing-view-page">
        <div className="listing-view-wrap">
          <div className="back-row mb-8">
            <Link className="btn-ghost btn-sm" href="/OperatorListings">
              Back to Listings
            </Link>
          </div>

          <section className="listing-grid">
            <div className="glass-panel listing-image">
              {listing.image_url ? (
                <Image
                  fill
                  alt={listing.title}
                  className="object-cover"
                  sizes="(max-width: 1100px) 100vw, 58vw"
                  unoptimized={listing.image_url.startsWith("data:")}
                  src={listing.image_url}
                />
              ) : (
                <div className="absolute inset-0 bg-surface-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-[48px] text-(--outline)">photo</span>
                </div>
              )}
            </div>

            <div className="listing-copy">
              <div className="glass-panel p-8">
                <p className="label-caps text-(--secondary)">Operator listing</p>
                <h1 className="title mt-3">{listing.title}</h1>
                <p className="copy mt-4">{listing.summary}</p>

                <div className="meta-row mt-6">
                  <span className="meta-pill">{listing.location}</span>
                  <span className="meta-pill">{listing.country}</span>
                  <span className="meta-pill">{listing.duration}</span>
                  <span className="meta-pill">{formatListingPrice(listing.price) ?? "Price on request"}</span>
                  <span className="meta-pill">{listing.is_active ? "Live" : "Draft"}</span>
                </div>
              </div>

              <div className="glass-panel p-8">
                <h2 className="font-display text-[2rem] leading-tight font-light">Listing details</h2>
                <div className="detail-grid mt-6">
                  <div className="glass-panel detail-card">
                    <p>Title</p>
                    <p>{listing.title}</p>
                  </div>
                  <div className="glass-panel detail-card">
                    <p>Operator</p>
                    <p>{listing.operator_name}</p>
                  </div>
                  <div className="glass-panel detail-card">
                    <p>Location</p>
                    <p>{listing.location}</p>
                  </div>
                  <div className="glass-panel detail-card">
                    <p>Duration</p>
                    <p>{listing.duration}</p>
                  </div>
                  <div className="glass-panel detail-card">
                    <p>Price</p>
                    <p>{formatListingPrice(listing.price) ?? "Price on request"}</p>
                  </div>
                  <div className="glass-panel detail-card">
                    <p>Status</p>
                    <p>{listing.is_active ? "Active listing" : "Draft listing"}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </PageShell>
  );
}
