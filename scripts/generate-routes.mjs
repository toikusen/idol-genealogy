// scripts/generate-routes.mjs
// Pre-build script: queries Supabase → writes prerender-routes.txt + public/sitemap.xml
// Requires Node 18+ (native fetch)

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import {
  memberIndexabilitySignals,
  groupIndexabilitySignals,
  companyIndexabilitySignals,
  isIndexable,
} from './indexability.mjs';

const SITE_URL = 'https://idolmaps.com';

// Fall back to the public anon key already committed in environment.ts
const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'https://ziiagdrrytyrmzoeegjk.supabase.co';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? 'sb_publishable_PtKb4LIJeJN3cECUJllW7w_UFRVTbTv';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const KNOWLEDGE_ROUTES = [
  '/learn/how-to-read-idol-history',
  '/learn/member-group-company-relationships',
  '/learn/data-source-and-correction',
];

function isTestName(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim().toLowerCase();
  return text === '測試帳號' || text === '測試用的團體' || text === '測試公司' || text === 'test';
}

async function run() {
  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, name, updated_at, notes, photo_url, instagram, facebook, x, maid_url, company_id');
  if (membersError) {
    console.error('Error fetching members:', membersError.message);
    process.exit(1);
  }

  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id, name, updated_at, notes, photo_url, instagram, facebook, x, youtube, company_id');
  if (groupsError) {
    console.error('Error fetching groups:', groupsError.message);
    process.exit(1);
  }

  const { data: histories, error: historiesError } = await supabase
    .from('history')
    .select('member_id, group_id');
  if (historiesError) {
    console.error('Error fetching histories:', historiesError.message);
    process.exit(1);
  }
  const memberHistoryCount = new Map();
  const groupHistoryCount = new Map();
  const publicMembers = members.filter(m => !isTestName(m.name));
  const publicGroups = groups.filter(g => !isTestName(g.name));
  const publicMemberIds = new Set(publicMembers.map(m => m.id));
  const publicGroupIds = new Set(publicGroups.map(g => g.id));
  const publicHistories = histories.filter(h =>
    (!h.member_id || publicMemberIds.has(h.member_id)) &&
    (!h.group_id || publicGroupIds.has(h.group_id))
  );
  for (const h of publicHistories) {
    if (h.member_id) memberHistoryCount.set(h.member_id, (memberHistoryCount.get(h.member_id) ?? 0) + 1);
    if (h.group_id) groupHistoryCount.set(h.group_id, (groupHistoryCount.get(h.group_id) ?? 0) + 1);
  }

  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('id, name, updated_at, description, photo_url, instagram, facebook, x, youtube, website');
  if (companiesError) {
    console.error('Error fetching companies:', companiesError.message);
    process.exit(1);
  }
  const publicCompanies = companies.filter(c => !isTestName(c.name));

  // Companies: affiliated entity count = groups + solo members (member with company_id and no history counts as solo).
  // Approximation: count any group or member with matching company_id.
  const companyAffiliationCount = new Map();
  for (const g of publicGroups) {
    if (g.company_id) companyAffiliationCount.set(g.company_id, (companyAffiliationCount.get(g.company_id) ?? 0) + 1);
  }
  for (const m of publicMembers) {
    if (m.company_id) companyAffiliationCount.set(m.company_id, (companyAffiliationCount.get(m.company_id) ?? 0) + 1);
  }

  const indexableMembers = publicMembers.filter(m =>
    isIndexable(memberIndexabilitySignals(m, memberHistoryCount.get(m.id) ?? 0)),
  );
  const indexableGroups = publicGroups.filter(g =>
    isIndexable(groupIndexabilitySignals(g, groupHistoryCount.get(g.id) ?? 0)),
  );
  const indexableCompanies = publicCompanies.filter(c =>
    isIndexable(companyIndexabilitySignals(c, companyAffiliationCount.get(c.id) ?? 0)),
  );

  const staticRoutes = [
    '/',
    '/members',
    '/contributors',
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
  ];
  writeFileSync('prerender-routes.txt', routes.join('\n') + '\n', 'utf8');
  console.log(
    `prerender-routes.txt: ${routes.length} routes ` +
    `(${indexableMembers.length}/${publicMembers.length} public members, ` +
    `${indexableGroups.length}/${publicGroups.length} public groups, ` +
    `${indexableCompanies.length}/${publicCompanies.length} public companies).`,
  );

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
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/about</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/contributors</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/wanted</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/guide</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/learn</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`,
    ...KNOWLEDGE_ROUTES.map(route => `  <url>
    <loc>${SITE_URL}${route}</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.75</priority>
  </url>`),
    `  <url>
    <loc>${SITE_URL}/contact</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/privacy</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/terms</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`,
    ...indexableMembers.map(m => `  <url>
    <loc>${SITE_URL}/member/${m.id}</loc>
    <lastmod>${(m.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`),
    ...indexableGroups.map(g => `  <url>
    <loc>${SITE_URL}/group/${g.id}</loc>
    <lastmod>${(g.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`),
    ...indexableCompanies.map(c => `  <url>
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
