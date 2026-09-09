/**
 * The public origin this deployment is reachable at, with no trailing slash.
 *
 * Used to build absolute URLs that leave the app and have to come back:
 * WiPay payment returns, links in outbound email, the Google Calendar OAuth
 * callback, and iCal feed URLs. If it is wrong those links go somewhere the
 * recipient cannot reach.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APP_URL      - set this; it is the only one that is explicit
 *   2. VERCEL_PROJECT_PRODUCTION_URL - the project's production domain, which
 *      Vercel injects automatically, so a forgotten env var degrades to the
 *      right host rather than to localhost
 *   3. http://localhost:3000    - local development only
 *
 * This previously lived as four near-identical copies (payments, email,
 * calendar, signup), each falling straight back to localhost. A production
 * deployment missing the variable therefore emailed customers localhost links
 * and sent WiPay a localhost return URL, with nothing failing loudly.
 */
const LOCAL_FALLBACK = "http://localhost:3000";

function stripTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

export function getAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (explicit) {
    return stripTrailingSlashes(explicit);
  }

  // Vercel provides this as a bare host, with no scheme.
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (vercelHost) {
    return stripTrailingSlashes(
      vercelHost.startsWith("http") ? vercelHost : `https://${vercelHost}`,
    );
  }

  return LOCAL_FALLBACK;
}

/** True when the resolved origin is not reachable from outside this machine. */
export function isLocalAppUrl(appUrl = getAppUrl()) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/i.test(appUrl);
}
