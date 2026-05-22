function isSpaRoute(pathname: string): boolean {
  if (pathname === '/login' || pathname === '/login/') return true;
  if (pathname === '/my-contributions' || pathname === '/my-contributions/') return true;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true;
  if (pathname.startsWith('/@')) return true;
  return false;
}

export const onRequest: PagesFunction = async ({ request, next, env }) => {
  const url = new URL(request.url);
  if (url.hostname === 'idol-genealogy.pages.dev') {
    url.hostname = 'idolmaps.com';
    return Response.redirect(url.toString(), 301);
  }

  if (isSpaRoute(url.pathname)) {
    const shellUrl = new URL('/index.csr.html', url.origin);
    const shell = await (env as any).ASSETS.fetch(new Request(shellUrl.toString()));
    return new Response(shell.body, { status: 200, headers: shell.headers });
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
