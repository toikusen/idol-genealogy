export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);
  if (url.hostname === 'idol-genealogy.pages.dev') {
    url.hostname = 'idolmaps.com';
    return Response.redirect(url.toString(), 301);
  }
  return next();
};
