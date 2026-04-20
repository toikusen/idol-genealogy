// Normalize an SNS handle or URL into an absolute URL.
//
// The admin UI asks contributors to paste full URLs (e.g. "https://instagram.com/foo"),
// but legacy records may carry bare handles ("foo", "@foo"). Both must end up as a
// single canonical absolute URL so anchor hrefs work and JSON-LD `sameAs` entries
// don't get double-prefixed.
//
// YouTube is special: its modern URL shape is "https://www.youtube.com/@channel" —
// the "@" is part of the path, not a prefix to strip. Path-style legacy handles
// (channel/UCxxx, c/name, user/name) are preserved as-is without prepending "@".

const SNS_BASES = {
  instagram: 'https://instagram.com/',
  facebook: 'https://facebook.com/',
  x: 'https://x.com/',
} as const;

export type SnsPlatform = keyof typeof SNS_BASES | 'youtube';

function normalizeYouTubeUrl(value: string): string | null {
  const token = value.replace(/^\/+/, '');
  if (!token) return null;
  if (/^@+$/.test(token)) return null;

  if (/^(?:@|channel\/|c\/|user\/|watch\?|playlist\?|shorts\/|live\/)/i.test(token)) {
    return `https://www.youtube.com/${token}`;
  }

  // Bare @handles are the most common legacy case and should resolve to
  // canonical channel URLs like https://www.youtube.com/@channel.
  if (!token.includes('/') && !token.includes('?')) {
    const handle = token.replace(/^@+/, '');
    return handle ? `https://www.youtube.com/@${handle}` : null;
  }

  // Preserve meaningful YouTube path prefixes for channel/user/c/watch URLs.
  return `https://www.youtube.com/${token}`;
}

export function normalizeSnsUrl(
  value: string | null | undefined,
  platform: SnsPlatform,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (platform === 'youtube') return normalizeYouTubeUrl(trimmed);
  const handle = trimmed.replace(/^@+/, '').replace(/^\/+/, '');
  if (!handle) return null;
  return SNS_BASES[platform] + handle;
}

export function normalizeWebsiteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const path = trimmed.replace(/^\/+/, '');
  return path ? `https://${path}` : null;
}
