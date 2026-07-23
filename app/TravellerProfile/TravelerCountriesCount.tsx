"use client";

import { useEffect, useMemo, useState } from "react";
import type { TravelerCountry } from "@/lib/supabase/profile-types";

type TravelerCountriesCountProps = {
  userId: string;
  countries: TravelerCountry[];
};

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

export function TravelerCountriesCount({ userId, countries }: TravelerCountriesCountProps) {
  const storageKey = `tt-connect-travel-summary:${userId}`;
  const [storedCountries, setStoredCountries] = useState<TravelerCountry[]>([]);

  useEffect(() => {
    const syncStoredCountries = () => {
      setStoredCountries(readStoredCountries(storageKey));
    };

    syncStoredCountries();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        syncStoredCountries();
      }
    };

    const handleCustomSync = () => syncStoredCountries();

    window.addEventListener("storage", handleStorage);
    window.addEventListener("tt-connect-travel-summary-changed", handleCustomSync);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("tt-connect-travel-summary-changed", handleCustomSync);
    };
  }, [storageKey]);

  const visibleCount = useMemo(
    () => mergeCountries(countries, storedCountries).length,
    [countries, storedCountries],
  );

  return <>{visibleCount}</>;
}
