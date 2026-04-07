// scripts/generate-routes.mjs
// Pre-build script: queries Supabase → writes prerender-routes.txt + public/sitemap.xml
// Requires Node 18+ (native fetch)

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SITE_URL = 'https://idolmaps.com';

// Fall back to the public anon key already committed in environment.ts
const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'https://ziiagdrrytyrmzoeegjk.supabase.co';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? 'sb_publishable_PtKb4LIJeJN3cECUJllW7w_UFRVTbTv';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  // Query all members
  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, updated_at');
  if (membersError) {
    console.error('Error fetching members:', membersError.message);
    process.exit(1);
  }

  // Query all groups
  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id, updated_at');
  if (groupsError) {
    console.error('Error fetching groups:', groupsError.message);
    process.exit(1);
  }

  // Query all companies
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('id, updated_at');
  if (companiesError) {
    console.error('Error fetching companies:', companiesError.message);
    process.exit(1);
  }

  // Write prerender-routes.txt
  const routes = [
    '/',
    '/members/',
    '/contributors/',
    '/guide/',
    '/about/',
    '/contact/',
    '/privacy/',
    '/terms/',
    ...members.map(m => `/member/${m.id}/`),
    ...groups.map(g => `/group/${g.id}/`),
    ...companies.map(c => `/company/${c.id}/`),
  ];
  writeFileSync('prerender-routes.txt', routes.join('\n') + '\n', 'utf8');
  console.log(`prerender-routes.txt: ${routes.length} routes written.`);

  // Write public/sitemap.xml
  const buildDate = new Date().toISOString().slice(0, 10);

  const urlEntries = [
    `  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,
    ...members.map(m => `  <url>
    <loc>${SITE_URL}/member/${m.id}/</loc>
    <lastmod>${(m.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`),
    ...groups.map(g => `  <url>
    <loc>${SITE_URL}/group/${g.id}/</loc>
    <lastmod>${(g.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`),
    ...companies.map(c => `  <url>
    <loc>${SITE_URL}/company/${c.id}/</loc>
    <lastmod>${(c.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`),
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('\n')}
</urlset>`;

  writeFileSync('public/sitemap.xml', sitemap, 'utf8');
  console.log(`sitemap.xml: ${urlEntries.length} URLs written.`);
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
