# Group Videos: Replace Hand-Maintained List With Auto-Fetched Popular Videos

**Date:** 2026-07-21
**Scope:** `group_videos` table, group-page video section, admin-groups video UI

## Problem

`group_videos` is a hand-maintained table (`url`, `title`, `sort_order`) surfaced on
group pages as「精選影片」. It has the same failure mode as the `groups.style` column
dropped in migration 086: it needs manual upkeep, gets forgotten, and decays into a
stale or empty field. Most groups already have a `groups.youtube` handle, so the
channel is the natural source of truth and the manual list is redundant work.

## Solution

Drop the manual list entirely. Fetch the group's recent uploads through a Cloudflare
Pages Function, rank them by view count, and render the top 3 client-side. No cron,
no editor upkeep.

The section is renamed from「精選影片」to「熱門影片」so the label matches what it
actually shows.

## Data Source: YouTube Data API v3

**The RSS feed was tried first and abandoned.** It is worth recording why, because
on paper it is the better option and the failure is not visible from a dev machine.

`https://www.youtube.com/feeds/videos.xml?channel_id=UC...` is public,
unauthenticated, unmetered, and carries exactly the fields needed, including
`media:community/media:statistics@views`. It was verified working, shipped, and
then **failed completely in production**: on 2026-07-21 every channel requested
through the deployed Pages Function returned empty, while the same feed URLs
returned 200 from a residential IP minutes apart. YouTube blocks that endpoint from
Cloudflare's egress IPs.

Notably the *channel pages* remain reachable from Cloudflare — `/api/youtube-channel-id`
kept working throughout — so the block is specific to the feed endpoint, not to
YouTube as a whole.

This also killed the fallback of persisting the last successful response: from
Cloudflare there is never a successful response to persist.

**The API path**, per refresh:

1. `playlistItems.list?part=contentDetails&playlistId=UU…&maxResults=15` — 1 unit.
   The uploads playlist ID is the channel ID with `UC` swapped for `UU`, which
   avoids a `channels.list` call.
2. `videos.list?part=snippet,statistics&id=…` — 1 unit. `playlistItems` does not
   carry view counts, hence the second call.

Two units per channel per cache miss, against a 10,000/day free tier. `search.list`
with `order=viewCount` would be one call but costs 100 units, so it is not used.

The ranking window is unchanged: the 15 most recent uploads, so the result is
"most-watched of the recent uploads", not all-time most-watched. For a group page
that is the better semantic anyway — it reflects what the group is doing now.

`YOUTUBE_API_KEY` is a Cloudflare Pages secret, restricted in Google Cloud to the
YouTube Data API with no application restriction (Workers egress IPs are not fixed,
and referrer restrictions do not apply to server-side calls). A missing key takes
the same path as any upstream failure: empty list, no video section.

## Ranking Rule

Take the 50 most recent uploads, keep those whose title mentions the group, sort by
view count descending, take 3.

### Shared Channels

Some groups list their company's channel, which hosts several groups. `@toyplataiwan`
carries both `月宵◇クレシェンテ` and `陽光◆スペクトラ`, so ranking the channel by views
put a sibling group's videos on both groups' pages.

Titles on those channels lead with the group name — `月宵◇クレシェンテ「Not a full
moon...」Live Music Video` — which is the only signal available. Filter on it, then
rank.

**When nothing matches, return everything unfiltered.** That fallback is what makes
the filter safe to run on every channel without deciding first whether a channel is
shared: a group's own channel rarely repeats the group name in its titles, and
filtering those to nothing would hide videos that were fine.

This is deliberately *not* driven by detecting shared channels in the database
(`select youtube_channel_id ... group by having count(*) > 1`, currently 1 hit). That
detection misses a company channel whose sibling groups are not in the database at
all — the fallback approach is correct in both cases and needs less code.

Matching is case-insensitive against `name` and `name_jp`, with a second pass that
strips decorative characters (`◇◆★☆♡` and friends) from both title and name, so a
title writing `月宵クレシェンテ` still matches the stored `月宵◇クレシェンテ`. Without
that second pass a punctuation mismatch would silently fall back to unfiltered — the
bug returning invisibly.

The candidate window is 50, not 15: after filtering, a group's videos can be sparse
among its siblings'. Both API endpoints cap at 50, so this is still 2 quota units.

**Known limit:** a group whose name is a common word could false-match a sibling's
video on a shared channel. The one shared channel in the data has two distinctive
names, so this is not addressed until observed.

**Shorts are deliberately not filtered.** `videos.list` could return
`contentDetails.duration` for a length heuristic, but that is a guess at intent
dressed up as a rule, and view-count ranking already mostly solves the problem: MVs
and notable uploads outrank routine 告知 videos on their own. Revisit only if Shorts
noise is observed on real group pages.

Revisit only if Shorts noise is observed in practice on real group pages.

## Channel ID Resolution

`groups.youtube` stores mostly bare `@handle` values (see `normalizeYouTubeUrl` in
`src/app/core/sns-url.utils.ts`); the RSS endpoint requires a `UC...` channel ID.

Add `groups.youtube_channel_id text`. Resolve by fetching the channel page and
extracting the ID.

### Extraction Patterns

Verified 2026-07-21 against `https://www.youtube.com/@RickAstleyYT`. Try in order,
first match wins:

1. `rel="canonical" href="[^"]*/channel/(UC[\w-]{22})` — hit
2. `channel_id=(UC[\w-]{22})` (the page's RSS alternate link) — hit
3. `itemprop="identifier" content="(UC[\w-]{22})"` — hit

**Do not rely on `"channelId":"UC..."` or `"browse_id":"UC..."`.** Both were tested
against that page and neither appears in the served HTML. They may be kept as
last-resort fallbacks but must never be the only pattern.

The unit test feeds each of the three patterns in isolation, plus an HTML string
containing none of them (expects null). Testing against a single saved page would
not catch a pattern silently disappearing, which is exactly the failure mode here.

### Where Resolution Runs

Server-side only. The admin browser cannot fetch `youtube.com` directly — CORS
blocks it.

`GET /api/youtube-channel-id?url=<normalized YouTube URL>` (`onRequestGet`), a Pages
Function that resolves and returns `{ channelId: string | null }`.

Kept separate from the video feed function on purpose: folding resolution into the
feed endpoint would add a channel-page fetch to every cache miss, and the resolved
ID is stable enough to belong in the database.

#### URL Validation

Hostname checking alone is not enough — `fetch` follows redirects by default, so a
YouTube URL that redirects off-site would still be fetched. (The obvious vector,
`youtube.com/redirect?q=...`, was tested 2026-07-21 and returns a 200 interstitial
rather than a 302, so it does not currently redirect server-side. The guard below
does not depend on that staying true.)

Extract this as a pure `parseChannelUrl(input): string | null` function:

- Parse with `new URL()`; reject anything that throws.
- Protocol must be `https:`.
- Hostname must be exactly `youtube.com`, `www.youtube.com`, or `m.youtube.com`.
- Path must match a channel form: `/@handle`, `/channel/UC...`, `/c/name`, `/user/name`.
- Everything else is rejected — `/watch`, `/playlist`, `/shorts`, `/redirect`, and
  any unrecognized path.

This doubles as the "is this even a channel URL?" check from the Write Rules below,
so a video or playlist URL is rejected before any network call.

Fetch the channel page with `redirect: 'manual'`. A redirect response is not
followed; treat it as unresolved rather than chasing it.

#### Timeouts And Status Codes

The channel-page fetch uses `AbortSignal.timeout(8000)`, same as the feed. Without
it an upstream stall blocks the admin save.

Distinguish the two failure kinds — conflating them would let a transient YouTube
outage permanently null out a valid channel ID:

- Page fetched, but no pattern matched (genuinely not a channel) → `200 { channelId: null }`
- Timeout, non-OK upstream, or redirect → `503`

The admin save treats 503 as "leave `youtube_channel_id` unchanged", and
`{ channelId: null }` as "write null".

### Write Rules

Resolution happens on save in admin-groups, before the group update. `youtube` and
`youtube_channel_id` are written in the **same** update so they can never disagree.

**A 503 while the channel is changing must abandon the save.** Keeping the old ID
but writing the new URL is the one combination that actively misleads — the group
page would show the previous channel's videos under the new channel's name. The
three cases:

| Situation | Outcome |
|---|---|
| URL unchanged, ID missing, resolver 503 | Save the other fields, leave ID null, retry next save |
| URL changed, resolver 503 | **Abandon the save**, surface an error |
| URL changed, resolver returns null | Save the new URL, set ID null |

**Resolve only when needed.** Always normalize first with
`normalizeSnsUrl(value, 'youtube')`, then compare against the stored value. Call the
resolver only if:

- Creating a group that has a `youtube` value, or
- The normalized `youtube` differs from the stored one, or
- `youtube_channel_id` is null while `youtube` is set (filling a gap).

Editing an unrelated field — name, colour, anything — must not trigger a YouTube
fetch. Normalizing before comparing means a cosmetic edit like `@Foo` → `youtube.com/@Foo`
does not count as a change either.

`youtube_channel_id` MUST be set to null when:

- `youtube` is cleared.
- `youtube` changed and the new value resolves to `{ channelId: null }`.
- The new value is a video, playlist, or other non-channel URL (caught by
  `parseChannelUrl` before any fetch).

Never carry the previous ID forward across a channel change — a stale ID means the
group page shows some other channel's videos, which is worse than showing nothing.

The one case that does **not** null: a 503 from the resolver. That is a transient
upstream failure, not evidence the channel is gone, so the existing ID stays and the
admin sees a warning. The null-on-gap rule above will retry it on a later save.

### Backfill

One-off script over rows where `youtube IS NOT NULL AND youtube_channel_id IS NULL`,
so it is safe to re-run and resumes where it left off. Throttle requests, do not
abort the batch on a single failure, and print the list of unresolved groups at the
end.

The script must apply the **same** normalization as the admin path. Legacy rows
store bare handles with no `@` (`RickAstleyYT`), which `normalizeSnsUrl` turns into
`/@RickAstleyYT`; a script that merely prepends the host produces `/RickAstleyYT`,
fails the channel-path check, and leaves those rows permanently unresolved.

## Pages Function

`functions/api/youtube-videos.ts`, following the existing `timetree-events.ts` shape
(query param in, validate, `Response.json` out) but with a different cache — see
Caching below.

- Request: `GET /api/youtube-videos?channel=UC...&match=<name>&match=<name_jp>`.
  The `match` terms carry into the cache key, so two groups sharing a channel
  cache separately — which is what they need.
- Validate `channel` against `/^UC[\w-]{22}$/`; 400 otherwise. This doubles as the
  SSRF guard — the channel ID is interpolated into a fixed YouTube URL, never a
  caller-supplied one.
- Call the YouTube Data API with `signal: AbortSignal.timeout(8000)` per request:
  `playlistItems.list` for recent uploads, then `videos.list` for their statistics.
- Parse, rank, slice to 3, return JSON.
- Any failure — missing key, non-OK response, timeout, empty result — returns an
  empty list rather than an error status. The frontend renders nothing either way,
  so a distinct error code would only add a path nobody handles.

### Historical: Why The RSS Feed Was Dropped

Superseded by the API — kept because the failure is invisible locally and someone
will otherwise propose the feed again as the "simpler" option.

Measured 2026-07-21 from a residential IP:

- First ~20 requests: 200, with any User-Agent (none, curl's default, browser).
- After that: 404 and 500 on every channel, while ordinary channel pages kept
  returning 200. Recovered on its own after roughly 30 minutes.

So from a home IP it was a temporary throttle. That is *not* what happens from
Cloudflare. Measured against the deployed Function the same day, three separate
channels — three distinct cache keys, so three fresh fetches — all returned empty,
while the same feed URLs returned 200 from the residential IP minutes apart. The
feed endpoint is blocked from Cloudflare's egress range, not merely throttled.

This also corrects an earlier claim in this document that a missing `User-Agent`
causes 404s. The header was never the variable.

### Caching

Use the Cloudflare **Cache API** keyed on the request URL, with
`Cache-Control: s-maxage=86400` (24 hours) on the stored response.

The TTL is not a freshness dial. Ranking is by view count, so a new upload starts
at 0 views and takes days to displace the current third place — the visible set
moves slowly whatever the TTL. What actually bounds it is dead links: a deleted or
privatised video stays cached for one TTL, showing a broken thumbnail. A day trades
those two off; going longer buys nothing and lengthens the broken-link window.

For the long tail of groups this is moot — visits are further apart than any TTL,
so those pages fetch on nearly every view regardless. The TTL only bites on groups
viewed several times a day.

Export as `onRequestGet`, not `onRequest`. `cache.put()` throws on a non-GET request
key, so a stray POST reaching the handler would error rather than 405.

Write with `context.waitUntil(cache.put(key, response.clone()))` so the cache write
does not block the response and is not cancelled when the isolate finishes.

Not an in-memory `Map` like `timetree-events.ts`. That pattern caches per-isolate,
and Cloudflare gives no guarantee that two requests hit the same isolate or that an
isolate survives between them. On a site with this traffic level most requests would
miss and hit YouTube directly — the opposite of what the cache is for. The Cache API
is a few lines more and is shared across isolates in a colo.

Response shape:

```ts
interface GroupVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
}
```

**Parsing notes.** Videos missing `statistics.viewCount` sort as 0 rather than being
dropped — a missing statistic should not hide a video entirely. Thumbnails fall back
`high` → `medium` → `default` → a URL derived from the video ID.

Titles still need HTML-entity decoding despite the payload being JSON: the API
returns `Rock &amp; Roll`, not `Rock & Roll`. `&amp;`, `&quot;`, `&#39;`, `&lt;`,
`&gt;` and numeric refs all appear in real titles. The unit test covers a title with
`&amp;` and a numeric reference.

## Frontend

Group page fetches client-side, outside the SSR/prerender path. Videos must not
affect SEO output and the build must not depend on an external service.

**SSR guard is required, not implied.** `loadDeferredData()` is called
unconditionally from `ngOnInit` (`group-page.component.ts:225`) and therefore runs
during SSR. Putting the fetch there without a guard would make the build depend on
YouTube. Gate the video fetch behind `isPlatformBrowser` (or start it from
`afterNextRender`).

States:

- No `youtube_channel_id` → section not rendered.
- Fetch in flight → **section not rendered.** There is no existing video skeleton —
  the section today only renders when `videos.length > 0` (`group-page.component.html:1050`),
  and the deferred skeleton lives in the songs section. Rendering nothing until the
  data arrives avoids both a new skeleton component and the layout shift a
  wrong-height placeholder would cause.
- Fetch fails, times out, or returns an empty list → section not rendered. No error
  state; a missing video strip is not worth an error message on a group page.

Card markup reuses the current video-card / thumbnail / play-overlay styling from
`group-page.component.html` (~line 1049). The existing `playVideo()` inline-player
toggle in `group-page.component.ts` is kept.

## Rollout Order

Two migrations, not one, so no deploy window runs old code against a dropped table:

1. **Migration A** — add `groups.youtube_channel_id`. Run the backfill. Deploy the
   new Pages Functions and frontend. Verify real group pages render videos.
2. **Migration B** — drop `group_videos`, only after A is confirmed working in
   production.

Dump `group_videos` before B (`select group_id, url, title from group_videos;`) and
document the query in the migration comment, following the 086 precedent for
irreversible drops.

## Deletions

Verified against the current tree:

- `group_videos` table (Migration B above).
- `getVideosByGroup` / `createVideo` / `deleteVideo` in `src/app/core/group.service.ts`
  (`:140`, `:150`, `:159`).
- The `GroupVideo` interface in `src/app/models/index.ts:87` — replaced by the new
  shape, same name.
- The `getVideosByGroup` call in `group-page.component.ts:266`, which is where videos
  are actually loaded.
- `GroupPageData.videos` in `src/app/core/page-data.resolvers.ts:79` and its empty
  array defaults (`:169`, `:183`, `:189`). The resolver never queried videos — it
  only carried the field.
- Video maintenance UI in `admin-groups.component.{ts,html}`.

## Testing

Response mapping and ranking are pure functions and get one unit test fed fixed
`videos.list` payloads covering: normal items, an item with no `statistics`, a title
with `&amp;` and a numeric entity reference, thumbnail fallback, an item with no
`id`, and malformed/empty/null payloads.

Channel-ID extraction gets one test per accepted pattern in isolation, plus a
negative case with none of them. Not a single saved page — the point of the test is
to catch one pattern disappearing, which is the failure this design was corrected for.

`parseChannelUrl` is a pure function guarding a network call and gets its own test:
valid `@handle`, valid `/channel/UC...`, `/c/` and `/user/` forms, non-HTTPS, a
lookalike hostname (`youtube.com.evil.test`), `/watch`, and `/redirect`.

`syncYouTubeChannelId` in admin-groups gets a component test — it is the only place
`youtube` and `youtube_channel_id` can drift apart, and no pure-function test can
catch that. Cases: first-time resolve, channel cleared, channel unchanged (must not
call YouTube at all), resolver returns null, and both 503 branches from the table in
Write Rules.

Nothing else here warrants a test — the Pages Function around the pure core is fetch,
cache, and status codes.

## Out Of Scope

- Shorts / livestream filtering (see Ranking Rule).
- Member-page videos — members have no channel field.
- Backfilling the existing hand-picked `group_videos` rows into anything. They are
  dropped. Dump them first if any are worth keeping.
