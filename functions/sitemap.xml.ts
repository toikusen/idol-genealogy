const SITE = 'https://idol-genealogy.pages.dev';
const SUPABASE_URL = 'https://ziiagdrrytyrmzoeegjk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_PtKb4LIJeJN3cECUJllW7w_UFRVTbTv';

async function fetchIds(table: string): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=id`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept-Profile': 'public',
      },
    }
  );
  if (!res.ok) return [];
  const data: { id: string }[] = await res.json();
  return data.map(r => r.id);
}

export const onRequest: PagesFunction = async () => {
  const [groupIds, memberIds] = await Promise.all([
    fetchIds('groups'),
    fetchIds('members'),
  ]);

  const staticUrls = ['', '/companies', '/privacy'];

  const urls = [
    ...staticUrls.map(path => `${SITE}${path}`),
    ...groupIds.map(id => `${SITE}/group/${id}`),
    ...memberIds.map(id => `${SITE}/member/${id}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
