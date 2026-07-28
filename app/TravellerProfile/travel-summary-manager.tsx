"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addTravelerCountryAction, deleteTravelerCountryAction } from "./actions";
import { initialTravelSummaryFormState } from "./types";
import type { TravelerCountry } from "@/lib/supabase/profile-types";

type TravelSummaryManagerProps = {
  countries: TravelerCountry[];
};

const COUNTRY_SUGGESTIONS = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Costa Rica",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Estonia",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kenya",
  "Latvia",
  "Lebanon",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malaysia",
  "Maldives",
  "Malta",
  "Mauritius",
  "Mexico",
  "Moldova",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Namibia",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Nigeria",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Panama",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Rwanda",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "South Africa",
  "South Korea",
  "Spain",
  "Sri Lanka",
  "Sweden",
  "Switzerland",
  "Tanzania",
  "Thailand",
  "Trinidad and Tobago",
  "Turkey",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Venezuela",
  "Vietnam",
  "Zambia",
  "Zimbabwe",
];

function normalizeCountryName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function TravelSummaryManager({ countries }: TravelSummaryManagerProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    addTravelerCountryAction,
    initialTravelSummaryFormState,
  );
  const [showSummary, setShowSummary] = useState(false);
  const [localMessage, setLocalMessage] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const [query, setQuery] = useState("");
  const visibleCountries = countries;

  const generatedSummary = useMemo(() => {
    if (!visibleCountries.length) {
      return "Add countries to generate a travel summary.";
    }

    const names = visibleCountries.map((country) => country.country_name);
    const primary = names.slice(0, 3).join(", ");
    const remainder = names.length > 3 ? ` and ${names.length - 3} more` : "";

    return `You've recorded ${names.length} ${names.length === 1 ? "country" : "countries"}: ${primary}${remainder}.`;
  }, [visibleCountries]);

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    const existingCountries = new Set(
      visibleCountries.map((country) => country.country_name.trim().toLowerCase()),
    );

    const matches = COUNTRY_SUGGESTIONS.filter((country) => {
      const normalizedCountry = country.toLowerCase();
      return (
        !existingCountries.has(normalizedCountry) &&
        (normalizedCountry.startsWith(normalizedQuery) || normalizedCountry.includes(normalizedQuery))
      );
    });

    return matches
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(normalizedQuery);
        const bStarts = b.toLowerCase().startsWith(normalizedQuery);

        if (aStarts !== bStarts) {
          return aStarts ? -1 : 1;
        }

        return a.localeCompare(b);
      })
      .slice(0, 8);
  }, [query, visibleCountries]);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  function validateCountry(countryName: string) {
    const normalizedCountry = normalizeCountryName(countryName);

    if (!normalizedCountry) {
      setLocalMessage("Please add a country name.");
      return null;
    }

    if (
      visibleCountries.some(
        (country) => country.country_name.toLowerCase() === normalizedCountry.toLowerCase(),
      )
    ) {
      setLocalMessage("That country is already in your travel summary.");
      return null;
    }

    return normalizedCountry;
  }

  function handleSuggestionSelect(countryName: string) {
    const normalizedCountry = validateCountry(countryName);
    if (!normalizedCountry) {
      return;
    }

    setLocalMessage("");
    setQuery(normalizedCountry);
    window.requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (!validateCountry(query)) {
      event.preventDefault();
      return;
    }

    setLocalMessage("");
  }

  function handleCountryAction(formData: FormData) {
    setQuery("");
    formAction(formData);
  }

  return (
    <section className="panel travel-summary-panel" id="travel-summary">
      <div className="travel-summary-head">
        <div>
          <p className="section-label">Travel Summary</p>
          <h2 className="section-title">Countries you have added</h2>
          <p className="section-copy">
            Keep a small list of destinations you want to revisit, compare, or plan next.
          </p>
        </div>

        <div className="travel-summary-count" aria-hidden="true">
          <span className="material-symbols-outlined">public</span>
          <strong>{visibleCountries.length}</strong>
        </div>
      </div>

      <form className="travel-summary-form" action={handleCountryAction} ref={formRef} onSubmit={handleFormSubmit}>
        <label className="travel-summary-label" htmlFor="country_name">
          Add a country
        </label>
        <div className="travel-summary-row">
          <div className="travel-summary-input-shell">
            <input
              id="country_name"
              name="country_name"
              placeholder="Search and add a country"
              aria-invalid={Boolean(state.fieldErrors.countryName?.length)}
              aria-describedby={state.fieldErrors.countryName?.length ? "country_name_error" : undefined}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              autoComplete="off"
            />

            {suggestions.length ? (
              <div className="travel-summary-suggestions" role="listbox" aria-label="Country suggestions">
                {suggestions.map((country) => (
                  <button
                    key={country}
                    className="travel-summary-suggestion"
                    type="button"
                    onClick={() => handleSuggestionSelect(country)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      location_on
                    </span>
                    <span>{country}</span>
                    <span className="material-symbols-outlined suggestion-add" aria-hidden="true">
                      add
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button className="button primary travel-summary-add" disabled={pending} type="submit">
            {pending ? "Adding" : "Add country"}
          </button>
        </div>
        {state.fieldErrors.countryName?.length ? (
          <p className="field-error" id="country_name_error" role="alert">
            {state.fieldErrors.countryName[0]}
          </p>
        ) : null}
        <p
          className={`form-status ${state.success ? "form-status-success" : "form-status-error"}`}
          aria-live="polite"
        >
          {localMessage ||
            (state.message === "Travel summary is not available yet." ? "" : state.message)}
        </p>
      </form>

      <div className="travel-summary-list" aria-label="Added countries">
          {visibleCountries.length ? (
            visibleCountries.map((country) => (
              <div key={country.id} className="travel-summary-item">
                <div className="travel-summary-item-copy">
                  <span className="material-symbols-outlined" aria-hidden="true">
                  location_on
                </span>
                <span>{country.country_name}</span>
              </div>

              <form action={deleteTravelerCountryAction}>
                <input name="country_id" type="hidden" value={country.id} />
                <button
                  className="travel-summary-delete"
                  aria-label={`Delete ${country.country_name}`}
                  type="submit"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    delete
                  </span>
                </button>
              </form>
            </div>
          ))
        ) : (
              <div className="travel-summary-empty">
                <span className="material-symbols-outlined" aria-hidden="true">
                  public
                </span>
                <p>No countries added yet.</p>
              </div>
          )}
        </div>

      <div className="travel-summary-actions">
        <button
          className="button travel-summary-summary-button"
          type="button"
          onClick={() => setShowSummary((current) => !current)}
        >
          {showSummary ? "Hide travel summary" : "Travel summary"}
        </button>
      </div>

      {showSummary ? (
        <article className="travel-summary-generated" aria-live="polite">
          <div className="travel-summary-generated-head">
            <span className="material-symbols-outlined" aria-hidden="true">
              travel_explore
            </span>
            <h3>Where you&apos;ve been</h3>
          </div>
          <p>{generatedSummary}</p>
          {visibleCountries.length ? (
            <div className="travel-summary-generated-chips" aria-label="Travel summary countries">
              {visibleCountries.map((country) => (
                <span key={country.id} className="travel-summary-generated-chip">
                  {country.country_name}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
