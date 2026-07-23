"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addTravelerCountryAction, deleteTravelerCountryAction } from "./actions";
import { initialTravelSummaryFormState } from "./types";
import type { TravelerCountry } from "@/lib/supabase/profile-types";

type TravelSummaryManagerProps = {
  countries: TravelerCountry[];
  userId: string;
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

function readStoredCountries(storageKey: string) {
  if (typeof window === "undefined") {
    return [] as TravelerCountry[];
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (!storedValue) {
      return [] as TravelerCountry[];
    }

    const parsed = JSON.parse(storedValue) as TravelerCountry[];
    return Array.isArray(parsed) ? parsed : ([] as TravelerCountry[]);
  } catch {
    return [] as TravelerCountry[];
  }
}

function mergeCountries(baseCountries: TravelerCountry[], storedCountries: TravelerCountry[]) {
  return [
    ...baseCountries,
    ...storedCountries.filter(
      (country) =>
        !baseCountries.some(
          (item) => item.country_name.toLowerCase() === country.country_name.toLowerCase(),
        ),
    ),
  ];
}

export function TravelSummaryManager({ countries, userId }: TravelSummaryManagerProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    addTravelerCountryAction,
    initialTravelSummaryFormState,
  );
  const [storedCountries, setStoredCountries] = useState<TravelerCountry[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [localMessage, setLocalMessage] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const storageKey = `tt-connect-travel-summary:${userId}`;
  const visibleCountries = useMemo(() => mergeCountries(countries, storedCountries), [countries, storedCountries]);

  useEffect(() => {
    setStoredCountries(readStoredCountries(storageKey));
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(storedCountries));
      window.dispatchEvent(new Event("tt-connect-travel-summary-changed"));
    } catch {
      // Ignore local storage failures; the UI still stays functional in memory.
    }
  }, [storageKey, storedCountries]);

  function syncVisibleCountries(nextCountries: TravelerCountry[]) {
    setStoredCountries(nextCountries);
  }

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
      return;
    }
  }, [router, state.success]);

  function addCountryToSummary(countryName: string) {
    const normalizedCountry = normalizeCountryName(countryName);

    if (!normalizedCountry) {
      return false;
    }

    if (
      visibleCountries.some(
        (country) => country.country_name.toLowerCase() === normalizedCountry.toLowerCase(),
      )
    ) {
      setLocalMessage("That country is already in your travel summary.");
      return false;
    }

    const nextCountry: TravelerCountry = {
      id: `local-${crypto.randomUUID()}`,
      user_id: userId,
      country_name: normalizedCountry,
      created_at: new Date().toISOString(),
    };

    syncVisibleCountries([...visibleCountries, nextCountry]);
    setLocalMessage("Country added.");

    window.setTimeout(() => {
      setQuery("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }, 0);

    return true;
  }

  function handleSuggestionSelect(countryName: string) {
    addCountryToSummary(countryName);
  }

  function handleFormSubmit() {
    addCountryToSummary(query);
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

      <form className="travel-summary-form" action={formAction} ref={formRef} onSubmit={handleFormSubmit}>
        <label className="travel-summary-label" htmlFor="country_name">
          Add a country
        </label>
        <div className="travel-summary-row">
          <div className="travel-summary-input-shell">
            <input
              ref={inputRef}
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
                  onClick={() => {
                    setStoredCountries((current) =>
                      current.filter((item) => item.id !== country.id),
                    );
                    setLocalMessage("Country removed.");
                  }}
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
