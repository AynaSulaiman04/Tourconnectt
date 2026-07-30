function isDateOnlyValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function parseDateValue(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = value.trim();
  if (isDateOnlyValue(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function usesUtcParts(value: string | Date | null | undefined) {
  return typeof value === "string" && isDateOnlyValue(value);
}

export function formatDate(value: string | Date | null | undefined, fallback = "Not set"): string {
  const date = parseDateValue(value);
  if (!date) {
    return fallback;
  }

  const utc = usesUtcParts(value);
  const day = utc ? date.getUTCDate() : date.getDate();
  const month = utc ? date.getUTCMonth() + 1 : date.getMonth() + 1;
  const year = utc ? date.getUTCFullYear() : date.getFullYear();

  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
}

export function formatDateTime(value: string | Date | null | undefined, fallback = "Not set"): string {
  const date = parseDateValue(value);
  if (!date) {
    return fallback;
  }

  if (typeof value === "string" && isDateOnlyValue(value)) {
    return formatDate(value, fallback);
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${formatDate(date, fallback)}, ${hours}:${minutes}`;
}

export function formatDateTimeUtc(value: string | Date | null | undefined, fallback = "Not set"): string {
  const date = parseDateValue(value);
  if (!date) {
    return fallback;
  }

  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}, ${hours}:${minutes} UTC`;
}

export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  options?: { fallback?: string; separator?: string },
) {
  const fallback = options?.fallback ?? "Not set";
  const separator = options?.separator ?? " to ";
  const startLabel = formatDate(start, fallback);
  const endLabel = formatDate(end, fallback);

  return startLabel === endLabel ? startLabel : `${startLabel}${separator}${endLabel}`;
}
