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
  // Query all members (include thin-content signals for sitemap filtering)
  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, updated_at, notes, photo_url, instagram, facebook, x, maid_url');
  if (membersError) {
    console.error('Error fetching members:', membersError.message);
    process.exit(1);
  }

  // Query all groups (include thin-content signals)
  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id, updated_at, notes, photo_url, instagram, facebook, x, youtube');
  if (groupsError) {
    console.error('Error fetching groups:', groupsError.message);
    process.exit(1);
  }

  // Query histories to know which members/groups have any activity
  const { data: histories, error: historiesError } = await supabase
    .from('histories')
    .select('member_id, group_id');
  if (historiesError) {
    console.error('Error fetching histories:', historiesError.message);
    process.exit(1);
  }
  const membersWithHistory = new Set(histories.map(h => h.member_id).filter(Boolean));
  const groupsWithHistory = new Set(histories.map(h => h.group_id).filter(Boolean));

  const memberIsIndexable = (m) =>
    membersWithHistory.has(m.id) || !!m.notes || !!m.photo_url ||
    !!m.instagram || !!m.facebook || !!m.x || !!m.maid_url;
  const groupIsIndexable = (g) =>
    groupsWithHistory.has(g.id) || !!g.notes || !!g.photo_url ||
    !!g.instagram || !!g.facebook || !!g.x || !!g.youtube;

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
    '/members',
    '/contributors',
    '/guide',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    ...members.map(m => `/member/${m.id}`),
    ...groups.map(g => `/group/${g.id}`),
    ...companies.map(c => `/company/${c.id}`),
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
    `  <url>
    <loc>${SITE_URL}/members</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/about</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/guide</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    ...members.filter(memberIsIndexable).map(m => `  <url>
    <loc>${SITE_URL}/member/${m.id}</loc>
    <lastmod>${(m.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`),
    ...groups.filter(groupIsIndexable).map(g => `  <url>
    <loc>${SITE_URL}/group/${g.id}</loc>
    <lastmod>${(g.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`),
    ...companies.map(c => `  <url>
    <loc>${SITE_URL}/company/${c.id}</loc>
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
