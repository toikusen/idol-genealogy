// scripts/backfill-youtube-channel-ids.mjs
// One-off backfill for migration 092: resolves groups.youtube (@handle) into
// groups.youtube_channel_id (UC...).
//
// Safe to re-run: only touches rows where youtube is set and youtube_channel_id
// is still null, so an interrupted run resumes where it left off. A single
// failure never aborts the batch; unresolved groups are listed at the end.
//
// Needs a service-role key — the anon key cannot update groups.
//   SUPABASE_SERVICE_KEY=... node scripts/backfill-youtube-channel-ids.mjs
//   ... --dry-run    resolve and report without writing

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'https://ziiagdrrytyrmzoeegjk.supabase.co';
const SERVICE_KEY = process.env['SUPABASE_SERVICE_KEY'];
const DRY_RUN = process.argv.includes('--dry-run');

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY is required (updating groups needs service role).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Mirrors src/app/core/youtube-feed.utils.ts. Duplicated rather than imported:
// this is a plain .mjs script and that file is TypeScript.
const ALLOWED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const CHANNEL_PATHS = [/^\/@[^/]+\/?$/, /^\/channel\/UC[\w-]{22}\/?$/, /^\/c\/[^/]+\/?$/, /^\/user\/[^/]+\/?$/];
const CHANNEL_ID_PATTERNS = [
  /rel="canonical"\s+href="[^"]*\/channel\/(UC[\w-]{22})/,
  /channel_id=(UC[\w-]{22})/,
  /itemprop="identifier"\s+content="(UC[\w-]{22})"/,
  /"browse_id":"(UC[\w-]{22})"/,
  /"channelId":"(UC[\w-]{22})"/,
];

const THROTTLE_MS = 1000;
const TIMEOUT_MS = 8000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mirrors normalizeYouTubeUrl in src/app/core/sns-url.utils.ts.
 *
 * Legacy rows store bare handles with no "@" ("RickAstleyYT"), which the admin
 * normalizer turns into "/@RickAstleyYT". Prepending the host without the "@"
 * would produce a path that fails the channel check, leaving those rows
 * permanently unresolved.
 */
function toCandidateUrl(input) {
  const token = input.trim().replace(/^\/+/, '');
  if (!token) return null;
  if (/^https?:\/\//i.test(token)) return token;

  // Path-style legacy handles already carry their own prefix.
  if (/^(?:@|channel\/|c\/|user\/)/i.test(token)) return `https://www.youtube.com/${token}`;

  // A bare word is a handle: give it the "@" the modern URL shape needs.
  if (!token.includes('/') && !token.includes('?')) return `https://www.youtube.com/@${token}`;

  return `https://www.youtube.com/${token}`;
}

function parseChannelUrl(input) {
  if (!input) return null;
  const candidate = toCandidateUrl(input);
  if (!candidate) return null;

  let url;
  try { url = new URL(candidate); } catch { return null; }

  if (url.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  if (!CHANNEL_PATHS.some(re => re.test(url.pathname))) return null;
  return `https://www.youtube.com${url.pathname}`;
}

async function resolveChannelId(channelUrl) {
  const res = await fetch(channelUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  for (const pattern of CHANNEL_ID_PATTERNS) {
    const match = pattern.exec(html);
    if (match) return match[1];
  }
  return null;
}

const { data: groups, error } = await supabase
  .from('groups')
  .select('id, name, youtube')
  .not('youtube', 'is', null)
  .is('youtube_channel_id', null);

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

console.log(`${groups.length} group(s) to resolve${DRY_RUN ? ' (dry run)' : ''}.\n`);

const unresolved = [];
let resolved = 0;

for (const group of groups) {
  const channelUrl = parseChannelUrl(group.youtube);

  if (!channelUrl) {
    unresolved.push(`${group.name} — not a channel URL: ${group.youtube}`);
    continue;
  }

  try {
    const channelId = await resolveChannelId(channelUrl);

    if (!channelId) {
      unresolved.push(`${group.name} — no channel ID in page: ${channelUrl}`);
    } else if (DRY_RUN) {
      console.log(`  would set ${group.name} → ${channelId}`);
      resolved++;
    } else {
      const { error: updateError } = await supabase
        .from('groups').update({ youtube_channel_id: channelId }).eq('id', group.id);
      if (updateError) {
        unresolved.push(`${group.name} — update failed: ${updateError.message}`);
      } else {
        console.log(`  ${group.name} → ${channelId}`);
        resolved++;
      }
    }
  } catch (e) {
    // Never abort the batch: a transient failure is retried on the next run,
    // since the row still has a null youtube_channel_id.
    unresolved.push(`${group.name} — fetch failed: ${e.message}`);
  }

  await sleep(THROTTLE_MS);
}

console.log(`\nResolved ${resolved}/${groups.length}.`);
if (unresolved.length) {
  console.log(`\nUnresolved (${unresolved.length}) — re-run to retry transient failures:`);
  for (const line of unresolved) console.log(`  - ${line}`);
}
