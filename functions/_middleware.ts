const PRODUCTION_HOST = 'idolmaps.com';

function isSpaRoute(pathname: string): boolean {
  if (pathname === '/login' || pathname === '/login/') return true;
  if (pathname === '/my-contributions' || pathname === '/my-contributions/') return true;
  if (pathname === '/my-favorites' || pathname === '/my-favorites/') return true;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true;
  if (pathname.startsWith('/@')) return true;
  return false;
}

function robotsForNonProduction(): Response {
  return new Response('User-agent: *\nDisallow: /\n', {
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function withNoIndexHeader(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest: PagesFunction = async ({ request, next, env }) => {
  const url = new URL(request.url);
  if (url.hostname === 'idol-genealogy.pages.dev') {
    url.hostname = 'idolmaps.com';
    return Response.redirect(url.toString(), 301);
  }

  const isProductionHost = url.hostname === PRODUCTION_HOST;

  if (!isProductionHost && url.pathname === '/robots.txt') {
    return robotsForNonProduction();
  }

  if (isSpaRoute(url.pathname)) {
    const shellUrl = new URL('/index.csr.html', url.origin);
    const shell = await (env as any).ASSETS.fetch(new Request(shellUrl.toString()));
    const response = new Response(shell.body, { status: 200, headers: shell.headers });
    return withNoIndexHeader(response);
  }

  const response = await next();

  const cacheControl = cacheControlForPath(url.pathname, response.status);
  if (!cacheControl && isProductionHost) return response;

  const headers = new Headers(response.headers);
  if (cacheControl) headers.set('Cache-Control', cacheControl);
  if (!isProductionHost) headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

function cacheControlForPath(pathname: string, status: number): string | null {
  if (status !== 200 && /\.(?:js|css|woff2|png|ico|webp)$/.test(pathname)) {
    return 'no-store';
  }

  if (status !== 200) {
    return null;
  }

  if (/\.(?:js|css|woff2)$/.test(pathname)) {
    return 'public, max-age=31536000, immutable';
  }
  if (/\.(?:png|ico|webp)$/.test(pathname)) {
    return 'public, max-age=2592000';
  }
  return null;
}
