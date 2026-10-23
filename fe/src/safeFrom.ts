/** ui-1a.3: `/login?from=` sends the user back after login; only paths inside this app are accepted. */
export function safeFrom(raw: string | null | undefined): string | undefined {
  if (!raw || !raw.startsWith('/')) return undefined;
  // '//host' and '/\host' are protocol-relative URLs to another site.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return undefined;
  return raw;
}
