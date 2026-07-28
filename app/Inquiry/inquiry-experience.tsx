"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createInquiryAction } from "./actions";
import { initialInquiryFormState } from "./types";
import type { TourListing } from "@/lib/supabase/inquiry-types";
import type { TravelerProfile } from "@/lib/supabase/profile-types";

type InquiryExperienceProps = {
  isAuthenticated: boolean;
  listings: TourListing[];
  profile: Pick<TravelerProfile, "full_name" | "email"> | null;
  initialListingId: string | null;
  initialTripRequest: {
    destination: string;
    preferredStartDate: string;
    preferredEndDate: string;
    guests: string;
    activities: string;
  };
  tracking: {
    referralCode: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent: string;
    utmTerm: string;
  };
};

const availabilityOptions = [
  { label: "Morning", value: "morning" },
  { label: "Afternoon", value: "afternoon" },
  { label: "Evening", value: "evening" },
  { label: "Flexible", value: "flexible" },
] as const;

function getDefaultInquiryListing(
  listings: TourListing[],
  initialListingId: string | null,
  initialTripRequest: InquiryExperienceProps["initialTripRequest"],
) {
  if (initialListingId) {
    const selectedListing = listings.find((listing) => listing.id === initialListingId);

    if (selectedListing) {
      return selectedListing;
    }
  }

  const destination = initialTripRequest.destination.trim().toLowerCase();
  if (destination) {
    const matchedListing = listings.find((listing) => {
      const haystack = `${listing.title} ${listing.location} ${listing.country} ${listing.operator_name}`.toLowerCase();
      return haystack.includes(destination);
    });

    if (matchedListing) {
      return matchedListing;
    }
  }

  return listings.find((listing) => listing.featured) ?? listings[0] ?? null;
}

export function InquiryExperience({
  isAuthenticated,
  listings,
  profile,
  initialListingId,
  initialTripRequest,
  tracking,
}: InquiryExperienceProps) {
  const [state, formAction, pending] = useActionState(
    createInquiryAction,
    initialInquiryFormState,
  );
  const defaultListing = getDefaultInquiryListing(listings, initialListingId, initialTripRequest);
  const [searchTerm, setSearchTerm] = useState("");
  const [availability, setAvailability] = useState<typeof availabilityOptions[number]["value"]>(
    "flexible",
  );

  const filteredListings = listings.filter((listing) => {
    const haystack = `${listing.title} ${listing.location} ${listing.country} ${listing.operator_name}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  const hasListings = filteredListings.length > 0;
  const hasAnyListings = listings.length > 0;
  const tripSummary =
    initialTripRequest.destination ||
    initialTripRequest.preferredStartDate ||
    initialTripRequest.preferredEndDate ||
    initialTripRequest.guests ||
    initialTripRequest.activities
      ? [
          initialTripRequest.destination ? `Destination: ${initialTripRequest.destination}` : null,
          initialTripRequest.preferredStartDate || initialTripRequest.preferredEndDate
            ? `Dates: ${initialTripRequest.preferredStartDate || "Select start"} to ${initialTripRequest.preferredEndDate || "Select end"}`
            : null,
          initialTripRequest.guests ? `Guests: ${initialTripRequest.guests}` : null,
          initialTripRequest.activities ? `Activities: ${initialTripRequest.activities}` : null,
        ]
          .filter((item): item is string => Boolean(item))
          .join(" | ")
      : "";
  const notesDefaultValue = tripSummary || initialTripRequest.activities || "";

  return (
    <main className="wrap">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Traveler inquiry</p>
          <h1 className="title">inquiry</h1>
          <p className="lede">Browse real tour listings and request an inquiry.</p>
          {tracking.referralCode ? (
            <p className="lede" style={{ marginTop: "0.75rem", color: "var(--secondary)" }}>
              Referral code applied: {tracking.referralCode}
            </p>
          ) : null}
          {tripSummary ? (
            <div className="panel" style={{ marginTop: "1.25rem", padding: "1rem 1.15rem", textAlign: "left" }}>
              <p className="section-eyebrow">Trip details carried over</p>
              <p className="panel-copy" style={{ marginTop: "0.4rem" }}>
                {tripSummary}
              </p>
            </div>
          ) : null}
        </div>

      </section>

      <section className="section request-section" id="request-form">
        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <p className="section-eyebrow">New request</p>
          <h2 className="panel-title">Share your preferred dates and availability</h2>
          <p className="panel-copy">
            Select a listing and send the details so operators can follow up.
          </p>

          {hasAnyListings ? (
            <form className="request-form" action={formAction}>
              <input name="referral_code" type="hidden" value={tracking.referralCode} />
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="inquiry_website">Website</label>
                <input
                  id="inquiry_website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
              <input name="utm_source" type="hidden" value={tracking.utmSource} />
              <input name="utm_medium" type="hidden" value={tracking.utmMedium} />
              <input name="utm_campaign" type="hidden" value={tracking.utmCampaign} />
              <input name="utm_content" type="hidden" value={tracking.utmContent} />
              <input name="utm_term" type="hidden" value={tracking.utmTerm} />
              <div className="request-form-grid">
                <label className="request-field">
                  <span>Selected listing</span>
                  <select
                    defaultValue={defaultListing?.id ?? ""}
                    aria-invalid={Boolean(state.fieldErrors.listingId?.length)}
                    aria-describedby={state.fieldErrors.listingId?.length ? "listing_id_error" : undefined}
                    name="listing_id"
                    required
                  >
                    <option disabled value="">
                      Choose a listing
                    </option>
                    {listings.map((listing) => (
                      <option key={listing.id} value={listing.id}>
                        {listing.title} - {listing.location}
                      </option>
                    ))}
                  </select>
                  {state.fieldErrors.listingId?.length ? (
                    <p className="field-error" id="listing_id_error" role="alert">
                      {state.fieldErrors.listingId[0]}
                    </p>
                  ) : null}
                </label>

                <label className="request-field">
                  <span>Preferred start</span>
                  <input
                    aria-invalid={Boolean(state.fieldErrors.preferredStartDate?.length)}
                    aria-describedby={
                      state.fieldErrors.preferredStartDate?.length ? "preferred_start_date_error" : undefined
                    }
                    defaultValue={initialTripRequest.preferredStartDate || ""}
                    name="preferred_start_date"
                    type="date"
                    required
                  />
                  {state.fieldErrors.preferredStartDate?.length ? (
                    <p className="field-error" id="preferred_start_date_error" role="alert">
                      {state.fieldErrors.preferredStartDate[0]}
                    </p>
                  ) : null}
                </label>
              </div>

              <div className="request-form-grid">
                <label className="request-field">
                  <span>Full name</span>
                  <input
                    aria-invalid={Boolean(state.fieldErrors.travelerName?.length)}
                    aria-describedby={state.fieldErrors.travelerName?.length ? "traveler_name_error" : undefined}
                    defaultValue={profile?.full_name ?? ""}
                    name="traveler_name"
                    placeholder="Your name"
                    required
                    type="text"
                  />
                  {state.fieldErrors.travelerName?.length ? (
                    <p className="field-error" id="traveler_name_error" role="alert">
                      {state.fieldErrors.travelerName[0]}
                    </p>
                  ) : null}
                </label>

                <label className="request-field">
                  <span>Email address</span>
                  <input
                    aria-invalid={Boolean(state.fieldErrors.travelerEmail?.length)}
                    aria-describedby={state.fieldErrors.travelerEmail?.length ? "traveler_email_error" : undefined}
                    defaultValue={profile?.email ?? ""}
                    name="traveler_email"
                    placeholder="traveler@email.com"
                    required
                    type="email"
                  />
                  {state.fieldErrors.travelerEmail?.length ? (
                    <p className="field-error" id="traveler_email_error" role="alert">
                      {state.fieldErrors.travelerEmail[0]}
                    </p>
                  ) : <p className="listing-meta">We will email your confirmation and the operator&apos;s reply.</p>}
                </label>
              </div>

              <div className="request-form-grid">
                <label className="request-field">
                  <span>Preferred end</span>
                  <input
                    aria-invalid={Boolean(state.fieldErrors.preferredEndDate?.length)}
                    aria-describedby={
                      state.fieldErrors.preferredEndDate?.length ? "preferred_end_date_error" : undefined
                    }
                    defaultValue={initialTripRequest.preferredEndDate || ""}
                    name="preferred_end_date"
                    type="date"
                    required
                  />
                  {state.fieldErrors.preferredEndDate?.length ? (
                    <p className="field-error" id="preferred_end_date_error" role="alert">
                      {state.fieldErrors.preferredEndDate[0]}
                    </p>
                  ) : null}
                </label>

                <label className="request-field">
                  <span>Phone number</span>
                  <input
                    aria-invalid={Boolean(state.fieldErrors.travelerPhone?.length)}
                    aria-describedby={state.fieldErrors.travelerPhone?.length ? "traveler_phone_error" : undefined}
                    name="traveler_phone"
                    placeholder="+1 868 555 0100"
                    type="tel"
                  />
                  {state.fieldErrors.travelerPhone?.length ? (
                    <p className="field-error" id="traveler_phone_error" role="alert">
                      {state.fieldErrors.travelerPhone[0]}
                    </p>
                  ) : null}
                </label>
              </div>

              <div className="request-field">
                <span>Availability preference</span>
                <div className="availability-grid">
                  {availabilityOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`availability-chip ${availability === option.value ? "active" : ""}`}
                      type="button"
                      onClick={() => setAvailability(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <input name="availability" type="hidden" value={availability} />
                {state.fieldErrors.availability?.length ? (
                  <p className="field-error" role="alert">
                    {state.fieldErrors.availability[0]}
                  </p>
                ) : null}
              </div>

              <label className="request-field">
                <span>Inquiry notes</span>
                <input
                  aria-invalid={Boolean(state.fieldErrors.notes?.length)}
                  aria-describedby={state.fieldErrors.notes?.length ? "notes_error" : undefined}
                  defaultValue={notesDefaultValue}
                  name="notes"
                  placeholder="Share dietary needs, room preferences, or special timing"
                  type="text"
                />
                {state.fieldErrors.notes?.length ? (
                  <p className="field-error" id="notes_error" role="alert">
                    {state.fieldErrors.notes[0]}
                  </p>
                ) : null}
              </label>

              <div className="button-row">
                <button className="button primary" disabled={pending} type="submit">
                  {pending ? "Submitting" : "Submit inquiry"}
                </button>
              </div>

              <p className={`form-status ${state.success ? "form-status-success" : "form-status-error"}`} aria-live="polite">
                {state.message}
              </p>
            </form>
          ) : (
            <div className="listing-card listing-empty" style={{ marginTop: "1.25rem" }}>
              <p className="section-eyebrow" style={{ marginBottom: "0.5rem" }}>
                No inquiry form yet
              </p>
              <h3 className="listing-title">The inquiry form appears when operators publish listings.</h3>
              <p className="listing-meta">
                You can still use Concierge to plan a trip and return once live inventory is available.
              </p>
              <div className="listing-actions">
                <Link className="button primary" href="/ConciergeChat">
                  Open Concierge
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="section browse-section" id="browse-listings">
        <div className="panel browse-header">
          <div>
            <p className="section-eyebrow">Browse listings</p>
            <h2 className="panel-title">Search tours before you send an inquiry</h2>
          </div>

          <div className="browse-search-wrap">
            <span className="material-symbols-outlined browse-search-icon" aria-hidden="true">
              search
            </span>
            <input
              aria-label="Search listings"
              className="search-field"
              placeholder="Search listings or operators"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              disabled={!hasAnyListings}
            />
          </div>
        </div>

        <div className="listing-list">
          {hasAnyListings ? (
            hasListings ? (
              filteredListings.map((listing, index) => (
                <article key={listing.id} className="listing-card">
                  <div className="listing-top">
                    <div>
                      <p className="section-eyebrow" style={{ marginBottom: "0.5rem" }}>
                        Listing {index + 1}
                      </p>
                      <h3 className="listing-title">{listing.title}</h3>
                    </div>
                    <p className="section-eyebrow" style={{ margin: 0 }}>
                      {listing.duration}
                    </p>
                  </div>

                  <div className="listing-body">
                    <p className="listing-meta">{listing.location}</p>
                    <p className="listing-meta">{listing.summary}</p>
                  </div>

                  <div className="listing-actions">
                    <Link className="button primary" href={isAuthenticated ? `/Messages?listing=${listing.id}` : "/SignUp"}>
                      Message Operator
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <article className="listing-card listing-empty">
                <p className="section-eyebrow" style={{ marginBottom: "0.5rem" }}>
                  No matching listings
                </p>
                <h3 className="listing-title">Try a different search</h3>
                <p className="listing-meta">
                  We could not find a listing that matches your current search. Clear the search to see all available tours.
                </p>
                <div className="listing-actions">
                  <button className="button" type="button" onClick={() => setSearchTerm("")}>
                    Clear search
                  </button>
                </div>
              </article>
            )
          ) : (
            <article className="listing-card listing-empty">
              <p className="section-eyebrow" style={{ marginBottom: "0.5rem" }}>
                No active listings
              </p>
              <h3 className="listing-title">Travelers can still explore Concierge and Messages.</h3>
              <p className="listing-meta">
                Operators have not published live listings yet. Once they do, the inquiry catalog will appear here automatically.
              </p>
              <div className="listing-actions">
                <Link className="button" href="/ConciergeChat">
                  Open Concierge
                </Link>
              </div>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
