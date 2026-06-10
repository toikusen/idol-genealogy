// scripts/seo-audit.mjs
// Post-build SEO contract checker — run after `npm run build`.
// Usage: node scripts/seo-audit.mjs
// Exit 1 on any error; exit 0 on clean pass.

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const DIST = 'dist/idol-genealogy/browser';
const SITE_URL = 'https://idolmaps.com';
const SITEMAP_PATH = join(DIST, 'sitemap.xml');
const SAMPLE_SIZE = 5;

const PRIVATE_ROUTES = ['/login', '/admin', '/my-contributions', '/my-favorites'];

// href/src patterns that must never appear in public prerendered HTML
const FORBIDDEN_ATTRS = [
  { re: /\?propose=true/, label: '?propose=true query param' },
  { re: /uat\.idolmaps\.com/, label: 'uat.idolmaps.com domain' },
  { re: /idol-genealogy\.pages\.dev/, label: 'idol-genealogy.pages.dev domain' },
  { re: /(?:href|src)="[^"]*\/admin(?:\/|"|[?#])/, label: 'link to /admin' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

let errors = 0;

function fail(msg) { console.error(`  ❌ ${msg}`); errors++; }
function pass(msg) { console.log(`  ✅ ${msg}`); }
function info(msg) { console.log(`  ℹ  ${msg}`); }
function section(title) { console.log(`\n${title}`); }

function urlToHtmlPath(loc) {
  const pathname = new URL(loc).pathname;
  return pathname === '/'
    ? join(DIST, 'index.html')
    : join(DIST, pathname.replace(/^\//, ''), 'index.html');
}

function sample(arr, n) {
  if (arr.length <= n) return [...arr];
  const step = Math.max(1, Math.floor(arr.length / n));
  return arr.filter((_, i) => i % step === 0).slice(0, n);
}

function findHtmlFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...findHtmlFiles(full));
    else if (entry === 'index.html') results.push(full);
  }
  return results;
}

// ─── preflight ───────────────────────────────────────────────────────────────

if (!existsSync(DIST)) {
  console.error(`dist not found at "${DIST}" — run \`npm run build\` first`);
  process.exit(1);
}
if (!existsSync(SITEMAP_PATH)) {
  console.error(`sitemap.xml not found at "${SITEMAP_PATH}"`);
  process.exit(1);
}

// ─── 1. Sitemap URL rules ────────────────────────────────────────────────────

section('── 1. Sitemap URL rules ────────────────────────────');

const sitemapXml = readFileSync(SITEMAP_PATH, 'utf8');
const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
info(`${sitemapUrls.length} URLs in sitemap`);

let sitemapRuleErrors = 0;
if (sitemapUrls.length === 0) {
  fail('sitemap contains no <loc> entries');
  sitemapRuleErrors++;
}

const seenSitemapUrls = new Set();
for (const loc of sitemapUrls) {
  let url;
  try { url = new URL(loc); } catch {
    fail(`invalid URL in sitemap: ${loc}`);
    sitemapRuleErrors++;
    continue;
  }

  if (seenSitemapUrls.has(loc)) {
    fail(`duplicate loc in sitemap: ${loc}`);
    sitemapRuleErrors++;
  }
  seenSitemapUrls.add(loc);

  if (!loc.startsWith(`${SITE_URL}/`)) {
    fail(`loc not on production host: ${loc}`);
    sitemapRuleErrors++;
  }
  if (url.search) {
    fail(`loc contains query string: ${loc}`);
    sitemapRuleErrors++;
  }
  if (url.hash) {
    fail(`loc contains hash: ${loc}`);
    sitemapRuleErrors++;
  }
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    fail(`non-root loc has trailing slash: ${loc}`);
    sitemapRuleErrors++;
  }
  for (const priv of PRIVATE_ROUTES) {
    if (url.pathname === priv || url.pathname.startsWith(priv + '/')) {
      fail(`private route in sitemap: ${loc}`);
      sitemapRuleErrors++;
    }
  }
}
if (sitemapRuleErrors === 0) pass('all sitemap URLs pass format + privacy rules');

// ─── 2. Sitemap → HTML existence ─────────────────────────────────────────────

section('── 2. Sitemap → HTML existence ─────────────────────');

let missingCount = 0;
for (const loc of sitemapUrls) {
  const htmlPath = urlToHtmlPath(loc);
  if (!existsSync(htmlPath)) {
    fail(`no prerender HTML for: ${loc}`);
    if (++missingCount >= 10) {
      fail(`(stopping after 10 — check sitemap/prerender sync)`);
      break;
    }
  }
}
if (missingCount === 0) pass(`all ${sitemapUrls.length} sitemap URLs have prerender HTML`);

const sitemapHtmlPaths = new Set(sitemapUrls.map(loc => urlToHtmlPath(loc)));
const extraHtmlFiles = findHtmlFiles(DIST).filter(path => !sitemapHtmlPaths.has(path));
if (extraHtmlFiles.length > 0) {
  for (const htmlFile of extraHtmlFiles.slice(0, 10)) {
    fail(`prerender HTML is not represented in sitemap: ${relative(DIST, htmlFile)}`);
  }
  if (extraHtmlFiles.length > 10) {
    fail(`and ${extraHtmlFiles.length - 10} more sitemap-orphan prerender HTML files`);
  }
} else {
  pass('no sitemap-orphan prerender HTML files found');
}

// ─── 3. HTML sample: canonical + robots ──────────────────────────────────────

section('── 3. HTML sample: canonical + robots ──────────────');

const memberUrls  = sitemapUrls.filter(u => new URL(u).pathname.startsWith('/member/'));
const groupUrls   = sitemapUrls.filter(u => new URL(u).pathname.startsWith('/group/'));
const companyUrls = sitemapUrls.filter(u => new URL(u).pathname.startsWith('/company/'));
const staticUrls  = sitemapUrls.filter(u => {
  const p = new URL(u).pathname;
  return !p.startsWith('/member/') && !p.startsWith('/group/') && !p.startsWith('/company/');
});

const toSample = [
  ...sample(memberUrls, SAMPLE_SIZE),
  ...sample(groupUrls, SAMPLE_SIZE),
  ...sample(companyUrls, SAMPLE_SIZE),
  ...staticUrls,
];
info(`checking ${toSample.length} pages (${SAMPLE_SIZE} sampled per dynamic category + all static)`);

// matches both attribute-order variants Angular might emit
const CANONICAL_RE = /rel="canonical"\s+href="([^"]+)"|href="([^"]+)"\s+rel="canonical"/;
const ROBOTS_RE    = /name="robots"\s+content="([^"]+)"|content="([^"]+)"\s+name="robots"/;

let htmlCheckErrors = 0;
for (const loc of toSample) {
  const htmlPath = urlToHtmlPath(loc);
  if (!existsSync(htmlPath)) continue;

  const html = readFileSync(htmlPath, 'utf8');
  const expectedPath = new URL(loc).pathname;
  const shortPath = relative(DIST, htmlPath);

  // canonical
  const cm = html.match(CANONICAL_RE);
  if (!cm) {
    fail(`no canonical link in: ${shortPath}`);
    htmlCheckErrors++;
    continue;
  }
  const canonicalHref = cm[1] ?? cm[2];
  let canonicalUrl;
  try { canonicalUrl = new URL(canonicalHref); } catch {
    fail(`unparseable canonical "${canonicalHref}" in: ${shortPath}`);
    htmlCheckErrors++;
    continue;
  }
  if (canonicalUrl.protocol !== 'https:') {
    fail(`canonical protocol is not https: "${canonicalHref}" in ${shortPath}`);
    htmlCheckErrors++;
  }
  if (canonicalUrl.hostname !== 'idolmaps.com') {
    fail(`canonical host is not idolmaps.com: "${canonicalHref}" in ${shortPath}`);
    htmlCheckErrors++;
  }
  if (canonicalUrl.pathname !== expectedPath) {
    fail(`canonical path "${canonicalUrl.pathname}" ≠ sitemap path "${expectedPath}" in ${shortPath}`);
    htmlCheckErrors++;
  }
  if (canonicalUrl.search) {
    fail(`canonical contains query string: "${canonicalHref}" in ${shortPath}`);
    htmlCheckErrors++;
  }
  if (canonicalUrl.hash) {
    fail(`canonical contains hash: "${canonicalHref}" in ${shortPath}`);
    htmlCheckErrors++;
  }

  // robots
  const rm = html.match(ROBOTS_RE);
  if (!rm) {
    fail(`no robots meta in: ${shortPath}`);
    htmlCheckErrors++;
  } else {
    const robots = (rm[1] ?? rm[2]).trim().toLowerCase();
    if (robots !== 'index, follow') {
      fail(`robots is "${robots}" (expected "index, follow") in: ${shortPath}`);
      htmlCheckErrors++;
    }
  }
}
if (htmlCheckErrors === 0) pass(`canonical + robots OK across all ${toSample.length} sampled pages`);

// ─── 4. Full link audit ───────────────────────────────────────────────────────

section('── 4. Link audit (full scan) ────────────────────────');

const allHtmlFiles = findHtmlFiles(DIST);
info(`scanning ${allHtmlFiles.length} HTML files`);

// Build a regex that captures all href/src attribute values in one pass
const ATTR_RE = /(?:href|src)="([^"]+)"/g;

let linkErrors = 0;
for (const htmlFile of allHtmlFiles) {
  const html = readFileSync(htmlFile, 'utf8');
  const shortPath = relative(DIST, htmlFile);
  const attrValues = [...html.matchAll(ATTR_RE)].map(m => m[0]); // keep full `href="..."` for pattern matching

  for (const { re, label } of FORBIDDEN_ATTRS) {
    const hits = attrValues.filter(a => re.test(a));
    if (hits.length > 0) {
      fail(`forbidden ${label} in ${shortPath}: ${hits[0]}`);
      linkErrors++;
    }
  }
}
if (linkErrors === 0) pass('no forbidden links found');

// ─── summary ──────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════');
if (errors === 0) {
  console.log('✅  SEO audit passed');
  process.exit(0);
} else {
  console.log(`❌  SEO audit failed — ${errors} error(s)`);
  process.exit(1);
}
