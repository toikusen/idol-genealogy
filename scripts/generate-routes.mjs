// scripts/generate-routes.mjs
// Pre-build script: queries Supabase → writes prerender-routes.txt + public/sitemap.xml
// Requires env vars: SUPABASE_URL, SUPABASE_ANON_KEY
// Requires Node 18+ (native fetch)

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SITE_URL = 'https://idol-genealogy.pages.dev';
const SUPABASE_URL = process.env['SUPABASE_URL'];
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'];

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required.');
  process.exit(1);
}

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

  // Write prerender-routes.txt
  const routes = [
    '/',
    ...members.map(m => `/member/${m.id}`),
    ...groups.map(g => `/group/${g.id}`),
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
    <loc>${SITE_URL}/member/${m.id}</loc>
    <lastmod>${(m.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`),
    ...groups.map(g => `  <url>
    <loc>${SITE_URL}/group/${g.id}</loc>
    <lastmod>${(g.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
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
