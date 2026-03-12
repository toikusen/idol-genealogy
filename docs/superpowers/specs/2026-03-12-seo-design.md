# SEO Implementation Design

**Date:** 2026-03-12
**Project:** idol-genealogy (台灣地下偶像族譜)
**Site:** https://idol-genealogy.pages.dev/
**Hosting:** Cloudflare Pages (static)

---

## Goal

Make individual idol member and group pages discoverable by search engines for two intents:
1. Specific searches (e.g., "某偶像名字 成員")
2. Category searches (e.g., "台灣地下偶像族譜", "台灣地下偶像成員列表")

---

## Approach: Static Prerendering + Full Meta Stack

Angular 19 prerender at build time generates static HTML for every member and group page. Combined with proper meta tags, JSON-LD structured data, sitemap, and robots.txt, Google can fully index all pages without JavaScript execution.

Rejected alternatives:
- **Quick wins only (no prerender):** Angular SPA pages load content via Supabase at runtime; Google cannot reliably index dynamic content on individual member/group pages.
- **SSR with Cloudflare Workers:** Overkill for a genealogy archive. Workers have free-tier limits; static prerendering achieves equivalent SEO without runtime complexity.

---

## Section 1: index.html — Base Meta Tags

**File:** `src/index.html`

Changes:
- `lang` attribute: `ja` → `zh-TW`
- `<title>`: `IdolGenealogy` → `台灣地下偶像族譜 | 成員・組合完整記錄`
- Add `<meta name="description">`: `台灣地下偶像成員與組合的完整族譜記錄。查詢偶像成員經歷、所屬組合歷史、活動記錄。`
- Add `<meta name="keywords">`: `台灣地下偶像,偶像族譜,台灣偶像,地下偶像,偶像成員,偶像組合`
- Add Open Graph tags: `og:type`, `og:title`, `og:description`, `og:url`, `og:locale`
- Add `og:image` pointing to a static default image `https://idol-genealogy.pages.dev/og-default.png` (a 1200×630 PNG placed in `public/`)
- Add `<link rel="canonical">` pointing to the site root

These serve as fallback defaults; per-page meta (Section 2) overrides them at runtime and prerender time.

---

## Section 2: Dynamic Per-Page Title & Meta via SeoService

**Files modified:**
- `src/app/pages/home/home.component.ts`
- `src/app/pages/member-page/member-page.component.ts`
- `src/app/pages/group-page/group-page.component.ts`

Each component injects `SeoService` (defined in Section 4) and calls `seoService.setPage(...)` and `seoService.setJsonLd(...)` after data loads. Components do **not** inject `Title` or `Meta` directly — all meta management goes through `SeoService`.

### Home page
```
title:       台灣地下偶像族譜 | 成員・組合完整記錄
description: 台灣地下偶像成員與組合的完整族譜記錄。查詢偶像成員經歷、所屬組合歷史、活動記錄。
url:         https://idol-genealogy.pages.dev/
og:image:    https://idol-genealogy.pages.dev/og-default.png
```

HomeComponent also reads the `q` query parameter on init via `ActivatedRoute` to support the `SearchAction` described in Section 4. If `?q=value` is present, it pre-fills the search input and runs the search.

### Member page (`/member/:id`)
```
title:          {member.name} - 台灣地下偶像族譜
description:    {member.name}的完整活動記錄，包含所屬組合與歷史經歷。
og:title:       same as title
og:description: same as description
og:url:         https://idol-genealogy.pages.dev/member/{id}
og:image:       member.photo_url if present, otherwise og-default.png
```

### Group page (`/group/:id`)
```
title:          {group.name} - 台灣地下偶像族譜
description:    {group.name}的成員組成與活動記錄。
og:title:       same as title
og:description: same as description
og:url:         https://idol-genealogy.pages.dev/group/{id}
og:image:       https://idol-genealogy.pages.dev/og-default.png (groups have no photo)
```

---

## Section 3: Static Prerendering

### Prerequisites

Install `@angular/ssr`:
```bash
ng add @angular/ssr --skip-application-builder
```

This creates two files that Angular's prerender pipeline requires:
- `src/main.server.ts` — server entry point
- `src/app/app.config.server.ts` — server-side app config with `provideServerRendering()`

### `angular.json` build options

Under the `build` architect target (which uses `@angular-devkit/build-angular:application`), add these two sibling keys alongside the existing `"options"`:

```json
"server": "src/main.server.ts",
"prerender": {
  "discoverRoutes": false,
  "routesFile": "prerender-routes.txt"
}
```

`discoverRoutes: false` because dynamic `:id` routes cannot be auto-discovered; they come from the script.

### How it works
1. A pre-build script queries Supabase for all member IDs and group IDs.
2. The script writes `prerender-routes.txt` to the project root.
3. Angular CLI reads `prerender-routes.txt` and generates a static `index.html` for each route.
4. Cloudflare Pages serves these static files directly (its static asset serving takes priority over `_redirects` 200-rewrites, so prerendered files are always served as-is).

### `prerender-routes.txt` format

One route per line, each starting with `/`:
```
/
/member/550e8400-e29b-41d4-a716-446655440000
/member/6ba7b810-9dad-11d1-80b4-00c04fd430c8
/group/7c9e6679-7425-40de-944b-e07fc1f90ae7
```

### New file: `scripts/generate-routes.mjs`
- Reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from environment variables
- Queries `members` table for all `id` values → `/member/{id}` routes
- Queries `groups` table for all `id` values → `/group/{id}` routes
- Writes `prerender-routes.txt` to project root (includes `/` as the first line)
- Also writes `public/sitemap.xml` (see Section 5)
- Calls `process.exit(1)` on any Supabase query error so Cloudflare Pages fails the build loudly
- Assumes Node 18+ (native `fetch` available; Cloudflare Pages uses Node 20 by default)

### `package.json` build script
```json
"build": "node scripts/generate-routes.mjs && ng build"
```

### Cloudflare Pages environment variables

Add in Cloudflare Pages dashboard → Settings → Environment variables:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anon key

These are the same read-only public values already used by the frontend; safe to store in CI.

### SPA fallback for non-prerendered routes

**File:** `public/_redirects`
```
/* /index.html 200
```

Cloudflare Pages serves static files (including prerendered `index.html` files inside route directories) before evaluating `_redirects` rules. This means prerendered pages are served as static HTML; non-prerendered routes (e.g., `/login`, `/admin/*`) fall through to the SPA fallback. No conflict.

---

## Section 4: SeoService + JSON-LD Structured Data

### `SeoService` (`src/app/core/seo.service.ts`)

Centralises all SEO concerns. Uses Angular's `Title` and `Meta` services (both prerender-safe). For JSON-LD, injects `DOCUMENT` from `@angular/common` to safely manipulate `<head>` in both browser and prerender contexts.

```ts
@Injectable({ providedIn: 'root' })
export class SeoService {
  constructor(
    private title: Title,
    private meta: Meta,
    @Inject(DOCUMENT) private doc: Document
  ) {}

  setPage(title: string, description: string, url: string, image?: string): void { ... }
  setJsonLd(data: object): void { ... }
  clearJsonLd(): void { ... }
}
```

`setPage()` updates:
- `<title>`
- `<meta name="description">`
- `og:title`, `og:description`, `og:url`, `og:image`

`setJsonLd()` creates or replaces `<script type="application/ld+json" id="ld-json">` in `<head>`.

**Important:** `DOCUMENT` injection (not bare `document`) is required; direct `document` access crashes during the prerender step.

### Home page — WebSite schema
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "台灣地下偶像族譜",
  "url": "https://idol-genealogy.pages.dev/",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://idol-genealogy.pages.dev/?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

Note: `HomeComponent` must read `?q=` from `ActivatedRoute` query params on init to honour the `SearchAction` URL template. If `?q=value` is present, pre-fill the search input and execute the search immediately.

### Member page — Person schema
```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "{member.name}",
  "url": "https://idol-genealogy.pages.dev/member/{id}",
  "birthDate": "{member.birthdate}",
  "description": "{member.notes}",
  "image": "{member.photo_url}",
  "memberOf": [
    { "@type": "MusicGroup", "name": "{group.name}" }
  ]
}
```

Omit any field whose value is null or empty string.

### Group page — MusicGroup schema
```json
{
  "@context": "https://schema.org",
  "@type": "MusicGroup",
  "name": "{group.name}",
  "url": "https://idol-genealogy.pages.dev/group/{id}",
  "foundingDate": "{group.founded_at}",
  "description": "{group.description}",
  "member": [
    { "@type": "Person", "name": "{member.name}" }
  ]
}
```

Omit any field whose value is null or empty string.

---

## Section 5: sitemap.xml + robots.txt

### sitemap.xml

Generated by `scripts/generate-routes.mjs` and written to `public/sitemap.xml`. Includes `<lastmod>` from each record's `updated_at` field (available from the same Supabase query used for route generation).

Structure:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://idol-genealogy.pages.dev/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://idol-genealogy.pages.dev/member/{id}</loc>
    <lastmod>{member.updated_at date only, e.g. 2026-01-15}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://idol-genealogy.pages.dev/group/{id}</loc>
    <lastmod>{group.updated_at date only}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
```

After deployment, submit `https://idol-genealogy.pages.dev/sitemap.xml` to Google Search Console.

### robots.txt

**File:** `public/robots.txt`
```
User-agent: *
Allow: /
Disallow: /admin/

Sitemap: https://idol-genealogy.pages.dev/sitemap.xml
```

---

## Files Created / Modified

| File | Action |
|------|--------|
| `src/index.html` | Modify — lang, title, description, OG tags, canonical, og:image |
| `public/og-default.png` | Create — 1200×630 default OG image |
| `public/robots.txt` | Create |
| `public/_redirects` | Create/update — SPA fallback |
| `src/main.server.ts` | Create — Angular SSR server entry (via `ng add @angular/ssr`) |
| `src/app/app.config.server.ts` | Create — server config with `provideServerRendering()` (via `ng add`) |
| `src/app/core/seo.service.ts` | Create — Title, Meta, JSON-LD management via DOCUMENT token |
| `src/app/pages/home/home.component.ts` | Modify — inject SeoService, set WebSite schema, read `?q=` query param |
| `src/app/pages/member-page/member-page.component.ts` | Modify — inject SeoService, set Person schema |
| `src/app/pages/group-page/group-page.component.ts` | Modify — inject SeoService, set MusicGroup schema |
| `scripts/generate-routes.mjs` | Create — queries Supabase, writes prerender-routes.txt + sitemap.xml |
| `angular.json` | Modify — add `server` entry point + `prerender` config to build target |
| `package.json` | Modify — prepend route generation to build script; add `@angular/ssr` |

---

## Post-Implementation Checklist

1. Run `ng add @angular/ssr --skip-application-builder` to install the package and scaffold server files
2. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Cloudflare Pages environment variables
3. Trigger a redeploy to verify prerendering works (`dist/` should contain `member/{id}/index.html` files)
4. Submit `https://idol-genealogy.pages.dev/sitemap.xml` to Google Search Console
5. Use Google's URL Inspection tool to verify a member page is fully indexable
6. Create `public/og-default.png` (1200×630, represents the site brand) before or during implementation
