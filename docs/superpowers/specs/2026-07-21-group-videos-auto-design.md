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

Drop the manual list entirely. Fetch the group's YouTube channel RSS feed through a
Cloudflare Pages Function, rank the returned entries by view count, and render the
top 3 client-side. No API key, no quota, no cron, no editor upkeep.

The section is renamed from「精選影片」to「熱門影片」so the label matches what it
actually shows.

## Why RSS And Not The YouTube Data API

`https://www.youtube.com/feeds/videos.xml?channel_id=UC...` is public, unauthenticated,
and unmetered. Verified 2026-07-21 against a live channel: each `<entry>` carries
`yt:videoId`, `title`, `published`, `media:thumbnail@url`, and — the deciding
factor — `media:community/media:statistics@views`.

That view count is what makes「熱門」possible for free. The trade-off is that the feed
returns only the channel's most recent ~15 uploads, so the ranking is "most-watched
of the recent uploads", not all-time most-watched. For a group page that is the
better semantic anyway: it reflects what the group is doing now.

## Ranking Rule

Sort the feed's entries by `views` descending, take 3. No other filtering.

**Shorts are deliberately not filtered.** The RSS feed carries no duration or video-type
field, so detecting Shorts requires probing `youtube.com/shorts/{id}` per video and
reading the status code (303 → regular video; verified for regular videos only, the
positive case was not confirmed). That is 15 extra requests per channel resting on
undocumented behavior, to solve a problem that view-count ranking already mostly
solves: MVs and notable uploads outrank routine 告知 videos on their own.

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

- Request: `GET /api/youtube-videos?channel=UC...`
- Validate `channel` against `/^UC[\w-]{22}$/`; 400 otherwise. This doubles as the
  SSRF guard — the channel ID is interpolated into a fixed YouTube URL, never a
  caller-supplied one.
- Fetch the RSS feed with `signal: AbortSignal.timeout(8000)`; on timeout or non-OK
  upstream return 503, so the frontend fails fast instead of hanging.
- Parse, rank, slice to 3, return JSON.

**Request headers.** Send `Accept: application/atom+xml, application/xml, text/xml`
and a browser-style `User-Agent`, matching `timetree-events.ts`. Cheap insurance,
not a documented requirement — see the rate-limit finding below for what actually
causes failures.

### Upstream Rate Limiting — Unresolved Risk

**The feed is rate-limited per IP, and this is the main threat to the design.**

Measured 2026-07-21 from one address:

- First ~20 requests: 200, with any User-Agent (none, curl's default, browser).
- After that: 404 and 500, on *every* channel tried, while ordinary channel pages
  (`youtube.com/@handle`) kept returning 200.
- Still failing after three retries spaced 20s apart.
- **Recovered on its own roughly 30 minutes later** — a later end-to-end run
  through the Pages Function returned all three videos correctly ranked.

So it is a temporary throttle, not a block. That makes the risk materially smaller
than a persistent failure would be, but it is still a throttle triggered by roughly
20 requests from one address.

This corrects an earlier claim in this document that a missing `User-Agent` causes
404s: the header is not the variable — request volume is. Both the original review
observation (404s) and the first rebuttal (all 200) were real, taken either side of
the rate limit.

**Why it matters:** Cloudflare Workers egress from shared datacenter IPs. If YouTube
throttles the feed that aggressively, production may fail often, and the video
section would frequently not render — arriving back at the original complaint (a
usually-empty section) by a different route.

**Why it is not a blocker yet:** every failure path degrades to "section not
rendered", so a throttled window is invisible rather than broken; the throttle
lifts by itself; and local testing cannot answer the question anyway — it measures
a home IP, not Cloudflare's egress. The 6-hour cache also means one request per
channel per colo per 24 hours, which is far below the rate that triggered it here.

**Mitigation in the implementation:** upstream failures are negative-cached as an
empty list for 5 minutes. Without it, a throttled window would have every visitor
re-hitting YouTube and extending the block.

**Decision: ship to UAT and measure before committing.** Deploy phase A, watch the
Function's 5xx and empty-response rate on real traffic for a week. If the feed
proves unreliable from Cloudflare, the fallbacks are (a) persist the last successful
result per group so a throttled fetch shows stale videos instead of none, or (b)
move to the YouTube Data API with a key and quota. **Migration B must not run until
this is settled** — until then `group_videos` stays as the rollback path.

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

**Parsing note:** the Workers runtime has no `DOMParser`. Parse by splitting on
`<entry>` and applying per-field regexes to each block — same shape of pragmatism as
the channel-ID extraction. Entries missing `views` sort as 0 rather than being dropped.

Titles must be XML-entity decoded after extraction — `&amp;`, `&quot;`, `&#39;`,
`&lt;`, `&gt;`, and numeric refs all appear in real video titles. The unit test
covers a title containing `&amp;` and a numeric reference.

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

RSS parsing and ranking are pure functions and get one unit test fed fixed XML
strings covering: normal entries, an entry with no `views`, a title with `&amp;` and
a numeric entity reference, and a malformed/empty feed.

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
