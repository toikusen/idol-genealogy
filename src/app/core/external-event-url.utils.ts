const TIMETREE_HOSTS = new Set(['timetreeapp.com', 'www.timetreeapp.com', 'timetr.ee']);

export function resolveAllowedExternalEventUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;

  for (const candidate of getUrlCandidates(value)) {
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' && TIMETREE_HOSTS.has(url.hostname.toLowerCase())) {
        return url.href;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function getUrlCandidates(value: string): string[] {
  try {
    const decoded = decodeURIComponent(value);
    return decoded === value ? [value] : [value, decoded];
  } catch {
    return [value];
  }
}
