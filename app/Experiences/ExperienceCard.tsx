import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { categoryLabel } from "@/lib/listing-taxonomy";
import type { ListingPriceLabel } from "@/lib/format/listing-price-label";

export type ExperienceCardData = {
  id: string;
  title: string;
  location: string | null;
  duration: string | null;
  summary: string | null;
  imageUrl: string | null;
  operatorName: string | null;
  category: string | null;
  price: ListingPriceLabel | null;
};

export function ExperienceCard({ listing }: { listing: ExperienceCardData }) {
  const detailHref = `/Experiences/${listing.id}`;
  const category = categoryLabel(listing.category);

  return (
    <article className="xp-card">
      <Link className="xp-card-image" href={detailHref} aria-label={`View ${listing.title}`}>
        {listing.imageUrl ? (
          <Image
            fill
            alt=""
            sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
            src={listing.imageUrl}
            unoptimized={listing.imageUrl.startsWith("data:") || listing.imageUrl.startsWith("blob:")}
          />
        ) : (
          <div className="xp-card-fallback">
            <span className="material-symbols-outlined" aria-hidden="true">
              photo_camera
            </span>
            <p>No cover image yet</p>
          </div>
        )}
        {category ? <span className="xp-card-tag">{category}</span> : null}
      </Link>

      <div className="xp-card-body">
        <p className="xp-card-meta">
          {listing.location || "Location on request"}
          {listing.operatorName ? <span aria-hidden="true"> · </span> : null}
          {listing.operatorName}
        </p>

        <h3 className="xp-card-title">
          <Link href={detailHref}>{listing.title}</Link>
        </h3>

        {listing.summary ? <p className="xp-card-copy">{listing.summary}</p> : null}

        <div className="xp-card-foot">
          {/* The price carries its own currency and basis, so nothing about the
              figure has to be explained elsewhere on the page. */}
          <div className="xp-card-price">
            {listing.price ? (
              <>
                <strong>{listing.price.amount}</strong>
                {listing.price.basis ? <span className="xp-card-basis">{listing.price.basis}</span> : null}
                {listing.price.approx ? (
                  <span className="xp-card-approx">{listing.price.approx}</span>
                ) : null}
              </>
            ) : (
              <strong className="xp-card-price-tbc">Price on enquiry</strong>
            )}
          </div>

          {listing.duration ? <span className="xp-card-duration">{listing.duration}</span> : null}
        </div>

        <div className="xp-card-actions">
          <Button href={detailHref} variant="primary" className="btn-sm">
            View experience
          </Button>
          <Button href={`/Enquiry?listing=${listing.id}`} variant="outline" className="btn-sm">
            Enquire
          </Button>
        </div>
      </div>
    </article>
  );
}
