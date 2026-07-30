export function hasSupabaseSessionCookie(
  cookies: Array<{ name: string }> | Iterable<{ name: string }>,
) {
  for (const entry of cookies) {
    if (/^sb-.*-auth-token(\.\d+)?$/.test(entry.name)) {
      return true;
    }
  }

  return false;
}
