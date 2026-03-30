export const SITE_URL = 'https://idolmaps.com';

export function normalizePublicPath(path: string): string {
  if (!path || path === '/') return '/';
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function siteUrl(path: string): string {
  const normalized = normalizePublicPath(path);
  return normalized === '/' ? `${SITE_URL}/` : `${SITE_URL}${normalized}`;
}

export function memberPath(id: string): string {
  return normalizePublicPath(`/member/${id}`);
}

export function groupPath(id: string): string {
  return normalizePublicPath(`/group/${id}`);
}

export function companyPath(id: string): string {
  return normalizePublicPath(`/company/${id}`);
}

export function memberHandlePath(handle: string): string {
  return normalizePublicPath(`/@${handle.replace(/^@+/, '')}`);
}
