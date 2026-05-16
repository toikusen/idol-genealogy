export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);
  if (url.hostname === 'idol-genealogy.pages.dev') {
    url.hostname = 'idolmaps.com';
    return Response.redirect(url.toString(), 301);
  }

  const response = await next();
  const cacheControl = cacheControlForPath(url.pathname);
  if (!cacheControl) return response;

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

function cacheControlForPath(pathname: string): string | null {
  if (/\.(?:js|css|woff2)$/.test(pathname)) {
    return 'public, max-age=31536000, immutable';
  }
  if (/\.(?:png|ico|webp)$/.test(pathname)) {
    return 'public, max-age=2592000';
  }
  return null;
}
