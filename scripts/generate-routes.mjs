// scripts/generate-routes.mjs
// Pre-build script: queries Supabase → writes prerender-routes.txt + public/sitemap.xml
// Requires Node 18+ (native fetch)

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
const SITE_URL = 'https://idolmaps.com';

// Cloudflare Pages sets CF_PAGES_BRANCH automatically on every build.
// Non-production branches (UAT, feature previews) must not be indexed by Google.
const PRODUCTION_BRANCH = 'master';
const cfBranch = process.env['CF_PAGES_BRANCH'];
if (cfBranch && cfBranch !== PRODUCTION_BRANCH) {
  writeFileSync('public/robots.txt', 'User-agent: *\nDisallow: /\n', 'utf8');
  console.log(`Non-production branch "${cfBranch}": robots.txt set to Disallow all.`);
}

// Fall back to the public anon key already committed in environment.ts
const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'https://ziiagdrrytyrmzoeegjk.supabase.co';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? 'sb_publishable_PtKb4LIJeJN3cECUJllW7w_UFRVTbTv';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const KNOWLEDGE_ROUTES = [
  '/learn/how-to-read-idol-history',
  '/learn/member-group-company-relationships',
  '/learn/data-source-and-correction',
  '/learn/upcoming-events-and-venues',
];

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rssDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

function shortText(value, fallback) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

// Google image sitemap extension — only absolute http(s) URLs are valid.
function sitemapImage(entity) {
  const url = typeof entity.photo_url === 'string' ? entity.photo_url.trim() : '';
  if (!/^https?:\/\//.test(url)) return '';
  return `
    <image:image>
      <image:loc>${escapeXml(url)}</image:loc>
    </image:image>`;
}

function isTestName(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim().toLowerCase();
  return text === '測試帳號' || text === '測試用的團體' || text === '測試公司' || text === 'test';
}

async function run() {
  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, name, updated_at, notes, photo_url');
  if (membersError) {
    console.error('Error fetching members:', membersError.message);
    process.exit(1);
  }

  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id, name, updated_at, photo_url');
  if (groupsError) {
    console.error('Error fetching groups:', groupsError.message);
    process.exit(1);
  }

  const publicMembers = members.filter(m => !isTestName(m.name));
  const publicGroups = groups.filter(g => !isTestName(g.name));

  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('id, name, updated_at');
  if (companiesError) {
    console.error('Error fetching companies:', companiesError.message);
    process.exit(1);
  }
  const publicCompanies = companies.filter(c => !isTestName(c.name));

  const { data: venues, error: venuesError } = await supabase
    .from('venues')
    .select('id, name, is_active');
  if (venuesError) {
    console.error('Error fetching venues:', venuesError.message);
    process.exit(1);
  }
  // Closed venues stay prerendered so old links keep working; the page itself
  // emits noindex. Only active venues go in the sitemap.
  const activeVenues = venues.filter(v => v.is_active);

  const indexableMembers = publicMembers;
  const indexableGroups = publicGroups;
  const indexableCompanies = publicCompanies;

  const staticRoutes = [
    '/',
    '/members',
    '/groups',
    '/companies',
    '/contributors',
    '/leaderboard',
    '/wanted',
    '/guide',
    '/learn',
    ...KNOWLEDGE_ROUTES,
    '/about',
    '/contact',
    '/privacy',
    '/terms',
  ];
  const routes = [
    ...staticRoutes,
    ...indexableMembers.map(m => `/member/${m.id}`),
    ...indexableGroups.map(g => `/group/${g.id}`),
    ...indexableCompanies.map(c => `/company/${c.id}`),
    ...venues.map(v => `/venue/${v.id}`),
  ];
  writeFileSync('prerender-routes.txt', routes.join('\n') + '\n', 'utf8');
  console.log(
    `prerender-routes.txt: ${routes.length} routes ` +
    `(${indexableMembers.length}/${publicMembers.length} public members, ` +
    `${indexableGroups.length}/${publicGroups.length} public groups, ` +
    `${indexableCompanies.length}/${publicCompanies.length} public companies, ` +
    `${activeVenues.length}/${venues.length} active venues).`,
  );

  const buildDate = new Date().toISOString().slice(0, 10);

  // Static pages carry no <lastmod>: stamping the build date on unchanged pages
  // teaches Google to distrust lastmod site-wide. Entity pages use real updated_at.
  const staticUrl = (path, changefreq, priority) => `  <url>
    <loc>${SITE_URL}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

  const urlEntries = [
    staticUrl('/', 'weekly', '1.0'),
    staticUrl('/members', 'daily', '0.8'),
    staticUrl('/groups', 'daily', '0.8'),
    staticUrl('/companies', 'weekly', '0.7'),
    staticUrl('/about', 'monthly', '0.5'),
    staticUrl('/contributors', 'monthly', '0.5'),
    staticUrl('/leaderboard', 'daily', '0.6'),
    staticUrl('/wanted', 'weekly', '0.5'),
    staticUrl('/guide', 'monthly', '0.5'),
    staticUrl('/learn', 'monthly', '0.7'),
    ...KNOWLEDGE_ROUTES.map(route => staticUrl(route, 'monthly', '0.75')),
    // Venue pages carry no <lastmod>: `venues.updated_at` does not move when the
    // schedule changes, and stamping the build date would claim a daily edit
    // that most venues never have.
    ...activeVenues.map(v => staticUrl(`/venue/${v.id}`, 'daily', '0.7')),
    staticUrl('/contact', 'monthly', '0.5'),
    staticUrl('/privacy', 'yearly', '0.3'),
    staticUrl('/terms', 'yearly', '0.3'),
    ...indexableMembers.map(m => `  <url>
    <loc>${SITE_URL}/member/${m.id}</loc>
    <lastmod>${(m.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>${sitemapImage(m)}
  </url>`),
    ...indexableGroups.map(g => `  <url>
    <loc>${SITE_URL}/group/${g.id}</loc>
    <lastmod>${(g.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>${sitemapImage(g)}
  </url>`),
    ...indexableCompanies.map(c => `  <url>
    <loc>${SITE_URL}/company/${c.id}</loc>
    <lastmod>${(c.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`),
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlEntries.join('\n')}
</urlset>`;

  writeFileSync('public/sitemap.xml', sitemap, 'utf8');
  console.log(`sitemap.xml: ${urlEntries.length} URLs written.`);

  const feedItems = indexableMembers
    .slice()
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    .slice(0, 50)
    .map(member => {
      const memberName = member.name || member.id;
      const url = `${SITE_URL}/member/${member.id}`;
      const title = `${memberName} - Idol Maps`;
      const description = shortText(
        member.notes,
        `${memberName} 的台灣地下偶像活動歷程與所屬團體紀錄。`,
      );
      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(description)}</description>
      <pubDate>${rssDate(member.updated_at)}</pubDate>
    </item>`;
    });
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Idol Maps 最新成員</title>
    <link>${SITE_URL}/</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Idol Maps 最近更新的台灣地下偶像成員資料。</description>
    <language>zh-TW</language>
    <lastBuildDate>${rssDate(buildDate)}</lastBuildDate>
${feedItems.join('\n')}
  </channel>
</rss>`;

  writeFileSync('public/feed.xml', feed, 'utf8');
  console.log(`feed.xml: ${feedItems.length} items written.`);
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
