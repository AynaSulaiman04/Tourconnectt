import { PageShell } from "@/components/layout/PageShell";
import { getInquiryListings } from "@/lib/supabase/inquiry";
import { getOptionalCurrentUserProfile, getRoleDashboardRoute } from "@/lib/supabase/profile";
import { redirect } from "next/navigation";
import { InquiryExperience } from "./inquiry-experience";

type InquiryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InquiryPage({ searchParams }: InquiryPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const [listings, profileContext] = await Promise.all([
    getInquiryListings(),
    getOptionalCurrentUserProfile(),
  ]);

  if (profileContext?.profile && profileContext.profile.role !== "traveler") {
    redirect(getRoleDashboardRoute(profileContext.profile.role));
  }

  const selectedListingId =
    typeof resolvedSearchParams.listing === "string" ? resolvedSearchParams.listing : null;
  const landingTripRequest = {
    destination: typeof resolvedSearchParams.destination === "string" ? resolvedSearchParams.destination.trim() : "",
    preferredStartDate:
      typeof resolvedSearchParams.preferred_start_date === "string"
        ? resolvedSearchParams.preferred_start_date.trim()
        : "",
    preferredEndDate:
      typeof resolvedSearchParams.preferred_end_date === "string"
        ? resolvedSearchParams.preferred_end_date.trim()
        : "",
    guests: typeof resolvedSearchParams.guests === "string" ? resolvedSearchParams.guests.trim() : "",
    activities: typeof resolvedSearchParams.activities === "string" ? resolvedSearchParams.activities.trim() : "",
  };
  const tracking = {
    referralCode: typeof resolvedSearchParams.ref === "string" ? resolvedSearchParams.ref : "",
    utmSource: typeof resolvedSearchParams.utm_source === "string" ? resolvedSearchParams.utm_source : "",
    utmMedium: typeof resolvedSearchParams.utm_medium === "string" ? resolvedSearchParams.utm_medium : "",
    utmCampaign: typeof resolvedSearchParams.utm_campaign === "string" ? resolvedSearchParams.utm_campaign : "",
    utmContent: typeof resolvedSearchParams.utm_content === "string" ? resolvedSearchParams.utm_content : "",
    utmTerm: typeof resolvedSearchParams.utm_term === "string" ? resolvedSearchParams.utm_term : "",
  };

  return (
    <PageShell variant="traveler">
      <style>{`
        .page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(167, 67, 31, 0.04), transparent 28%),
            radial-gradient(circle at top right, rgba(111, 98, 73, 0.04), transparent 30%),
            var(--background);
          color: var(--on-surface);
        }

        .wrap {
          max-width: 1480px;
          margin: 0 auto;
          padding: 3.5rem 5rem 4.5rem;
        }

        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .hero-copy {
          max-width: 48rem;
        }

        .eyebrow,
        .section-eyebrow {
          margin: 0;
          color: var(--secondary);
          font-size: 0.75rem;
          line-height: 1.4;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .title {
          margin: 0.75rem 0 0;
          font-family: var(--font-display);
          font-size: clamp(4rem, 8vw, 7rem);
          line-height: 0.9;
          letter-spacing: -0.05em;
          font-weight: 300;
          text-transform: lowercase;
        }

        .lede {
          margin: 1rem 0 0;
          max-width: 44rem;
          color: var(--on-surface-variant);
          font-size: 1rem;
          line-height: 1.65;
          font-weight: 300;
        }

        .primary-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin: 0 0 2rem;
        }

        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 2.65rem;
          padding: 0.75rem 1.15rem;
          border-radius: 999px;
          border: 1px solid rgba(167, 67, 31, 0.18);
          background: rgba(255, 253, 251, 0.68);
          color: var(--secondary);
          font-size: 0.72rem;
          line-height: 1;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
          transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease;
        }

        .button:hover {
          transform: translateY(-1px);
          border-color: rgba(167, 67, 31, 0.26);
          background: rgba(167, 67, 31, 0.06);
        }

        .button.primary {
          background: var(--primary);
          color: var(--on-primary);
          border-color: transparent;
        }

        .section {
          display: grid;
          gap: 1.75rem;
          margin-top: 1.25rem;
        }

        .browse-section {
          gap: 1rem;
          margin-top: 2rem;
        }

        .panel {
          padding: 2rem;
          border: 1px solid rgba(55, 45, 38, 0.08);
          border-radius: var(--radius-panel);
          background: rgba(255, 253, 251, 0.84);
          box-shadow: var(--shadow-card);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        .browse-header {
          display: grid;
          gap: 1rem;
        }

        .browse-search-wrap {
          width: 100%;
          position: relative;
        }

        .panel-title {
          margin: 0.75rem 0 0;
          font-family: var(--font-display);
          font-size: clamp(2rem, 3vw, 3.2rem);
          line-height: 1.02;
          letter-spacing: -0.04em;
          font-weight: 300;
          text-transform: lowercase;
        }

        .panel-copy {
          margin: 0.85rem 0 0;
          color: var(--on-surface-variant);
          font-size: 1rem;
          line-height: 1.65;
        }

        .request-field input,
        .request-field select {
          width: 100%;
          min-height: 3rem;
          padding: 0.85rem 1rem;
          border: 1px solid var(--outline-variant);
          border-radius: 1rem;
          background: var(--surface-container-lowest);
          color: var(--on-surface);
          outline: none;
        }

        .search-field {
          width: 100%;
          min-height: 3.6rem;
          padding: 0.95rem 1rem 0.95rem 2.8rem;
          border: 1px solid var(--outline-variant);
          border-radius: 1rem;
          background: var(--surface-container-lowest);
          color: var(--on-surface);
          outline: none;
          font-size: 1rem;
          box-shadow: 0 12px 26px rgba(53, 39, 33, 0.04);
        }

        .search-field:focus {
          border-color: rgba(167, 67, 31, 0.26);
          box-shadow: 0 0 0 4px rgba(167, 67, 31, 0.08);
        }

        .browse-search-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--on-surface-variant);
          font-size: 1.05rem;
          pointer-events: none;
        }

        .filter-tags,
        .button-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
        }

        .tag,
        .availability-chip {
          min-height: 2.5rem;
          padding: 0.65rem 0.85rem;
          border: 1px solid var(--outline-variant);
          border-radius: 999px;
          background: var(--surface-container-lowest);
          color: var(--on-surface-variant);
          font-size: 0.72rem;
          line-height: 1;
          letter-spacing: 0.15em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .listing-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
          gap: 1rem;
        }

        .listing-card {
          padding: 1.35rem;
          border: 1px solid var(--outline-variant);
          border-radius: var(--radius-card);
          background: var(--surface-container-lowest);
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          align-content: start;
          min-height: 100%;
        }

        .listing-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }

        .listing-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(1.7rem, 2.5vw, 2.4rem);
          line-height: 1.02;
          font-weight: 300;
          text-transform: lowercase;
        }

        .listing-meta {
          margin: 0;
          color: var(--on-surface-variant);
          font-size: 0.92rem;
          line-height: 1.5;
        }

        .listing-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
          margin-top: auto;
          padding-top: 0.35rem;
        }

        .listing-body {
          display: grid;
          gap: 0.4rem;
        }

        .listing-empty {
          grid-column: 1 / -1;
          min-height: 14rem;
          align-content: center;
        }

        .request-section {
          margin-top: 2rem;
        }

        .request-form {
          margin-top: 1.5rem;
          display: grid;
          gap: 1.25rem;
        }

        .request-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .request-field {
          display: grid;
          gap: 0.6rem;
        }

        .request-field > span {
          color: var(--secondary);
          font-size: 0.75rem;
          line-height: 1.4;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
        }

        .request-field input[type="date"],
        .request-field input[type="tel"],
        .request-field input[type="email"],
        .request-field input[type="text"],
        .request-field select {
          width: 100%;
          min-height: 3rem;
          padding: 0.85rem 1rem;
          border: 1px solid var(--outline-variant);
          border-radius: 1rem;
          background: var(--surface-container-lowest);
          color: var(--on-surface);
          outline: none;
        }

        .request-field input::placeholder {
          color: rgba(90, 82, 75, 0.45);
        }

        .availability-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.6rem;
        }

        .availability-chip {
          cursor: pointer;
          background: transparent;
        }

        .availability-chip.active {
          border-color: var(--secondary);
          color: var(--secondary);
          background: rgba(167, 67, 31, 0.06);
        }

        .field-error {
          margin: 0;
          color: var(--secondary);
          font-size: 12px;
          line-height: 18px;
          font-weight: 500;
        }

        .form-status {
          min-height: 36px;
          margin: 8px 0 0;
          padding: 12px 14px;
          border: 1px solid transparent;
          border-radius: 16px;
          font-size: 14px;
          line-height: 22px;
          font-weight: 300;
        }

        .form-status:empty {
          display: none;
        }

        .form-status-error {
          border-color: rgba(167, 67, 31, 0.14);
          background: rgba(167, 67, 31, 0.05);
          color: var(--on-surface-variant);
        }

        .form-status-success {
          border-color: rgba(180, 122, 22, 0.16);
          background: rgba(180, 122, 22, 0.06);
          color: var(--on-surface-variant);
        }

        .footer {
          margin-top: 3.5rem;
          padding-top: 2rem;
          border-top: 1px solid rgba(55, 45, 38, 0.08);
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          color: rgba(90, 82, 75, 0.65);
          font-size: 0.68rem;
          line-height: 1.4;
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
        }

        @media (max-width: 980px) {
          .wrap {
            padding: 3rem 1.5rem 4rem;
          }

          .availability-grid,
          .request-form-grid {
            grid-template-columns: 1fr 1fr;
          }

          .listing-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .wrap {
            padding: 2rem 0.75rem 3rem;
          }

          .title {
            font-size: clamp(3.2rem, 20vw, 5rem);
          }

          .panel {
            padding: 1.25rem;
            border-radius: 1.35rem;
          }

          .listing-list,
          .availability-grid,
          .request-form-grid {
            grid-template-columns: 1fr;
          }

          .primary-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .footer {
            flex-direction: column;
          }

          .request-field input,
          .request-field select,
          .search-field {
            min-width: 0;
            font-size: 1rem;
          }

          .button,
          .listing-actions .button {
            width: 100%;
          }
        }
      `}</style>

      <div className="page">
        <InquiryExperience
          initialListingId={selectedListingId}
          isAuthenticated={Boolean(profileContext?.profile)}
          listings={listings}
          initialTripRequest={landingTripRequest}
          profile={
            profileContext?.profile
              ? {
                  full_name: profileContext.profile.full_name,
                  email: profileContext.profile.email,
                }
              : null
          }
          tracking={tracking}
        />
      </div>
    </PageShell>
  );
}
