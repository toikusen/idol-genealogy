// Normalize an SNS handle or URL into an absolute URL.
//
// The admin UI asks contributors to paste full URLs (e.g. "https://instagram.com/foo"),
// but legacy records may carry bare handles ("foo", "@foo"). Both must end up as a
// single canonical absolute URL so anchor hrefs work and JSON-LD `sameAs` entries
// don't get double-prefixed.

const SNS_BASES = {
  instagram: 'https://instagram.com/',
  facebook: 'https://facebook.com/',
  x: 'https://x.com/',
  youtube: 'https://youtube.com/',
} as const;

export type SnsPlatform = keyof typeof SNS_BASES;

export function normalizeSnsUrl(
  value: string | null | undefined,
  platform: SnsPlatform,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@+/, '').replace(/^\/+/, '');
  if (!handle) return null;
  return SNS_BASES[platform] + handle;
}
