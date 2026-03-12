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
- Add `<link rel="canonical">` pointing to the site root

These serve as fallback defaults; per-page meta (Section 2) overrides them at runtime and prerender time.

---

## Section 2: Dynamic Per-Page Title & Meta

**Files modified:**
- `src/app/pages/home/home.component.ts`
- `src/app/pages/member-page/member-page.component.ts`
- `src/app/pages/group-page/group-page.component.ts`

Each component injects Angular's `Title` and `Meta` services and calls them after data loads.

### Home page
```
title:       台灣地下偶像族譜 | 成員・組合完整記錄
description: 台灣地下偶像成員與組合的完整族譜記錄。查詢偶像成員經歷、所屬組合歷史、活動記錄。
```

### Member page (`/member/:id`)
```
title:       {member.name} - 台灣地下偶像族譜
description: {member.name}的完整活動記錄，包含所屬組合與歷史經歷。
og:title:    same as title
og:description: same as description
og:url:      https://idol-genealogy.pages.dev/member/{id}
og:image:    member.photo_url (if present)
```

### Group page (`/group/:id`)
```
title:       {group.name} - 台灣地下偶像族譜
description: {group.name}的成員組成與活動記錄。
og:title:    same as title
og:description: same as description
og:url:      https://idol-genealogy.pages.dev/group/{id}
```

A shared private helper `setSeoMeta(title, description, url, image?)` avoids repetition across components.

---

## Section 3: Static Prerendering

### How it works
1. A pre-build script queries Supabase for all member IDs and group IDs.
2. The script writes `prerender-routes.txt` listing every route to render.
3. Angular CLI reads `prerender-routes.txt` and generates a static `index.html` for each route at build time.
4. Cloudflare Pages serves these static files directly.

### New file: `scripts/generate-routes.mjs`
- Reads Supabase URL + anon key from environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- Queries `members` table for all IDs → `/member/{id}`
- Queries `groups` table for all IDs → `/group/{id}`
- Writes `prerender-routes.txt` to project root (also writes `public/sitemap.xml` — see Section 5)

### `angular.json` build options
```json
"prerender": {
  "discoverRoutes": false,
  "routesFile": "prerender-routes.txt"
}
```

`discoverRoutes: false` because dynamic `:id` routes cannot be auto-discovered; they come from the script.

### `package.json` build script
```json
"build": "node scripts/generate-routes.mjs && ng build"
```

### Cloudflare Pages environment variables
Add in Cloudflare Pages dashboard → Settings → Environment variables:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anon key

These are read-only public values (same as what the frontend already uses), safe to store in CI environment.

### SPA fallback for non-prerendered routes
`public/_redirects`:
```
/* /index.html 200
```
Ensures routes not covered by prerender (e.g., `/login`, `/admin/*`) still work as SPA.

---

## Section 4: JSON-LD Structured Data

A `SeoService` (new, `src/app/core/seo.service.ts`) manages structured data injection. It creates/replaces a `<script type="application/ld+json" id="ld-json">` tag in `<head>` on each navigation.

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

### Member page — Person schema
```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "{member.name}",
  "birthDate": "{member.birthdate}",
  "description": "{member.notes}",
  "image": "{member.photo_url}",
  "memberOf": [
    { "@type": "MusicGroup", "name": "{group.name}" }
  ]
}
```
Fields are omitted when null/empty.

### Group page — MusicGroup schema
```json
{
  "@context": "https://schema.org",
  "@type": "MusicGroup",
  "name": "{group.name}",
  "foundingDate": "{group.founded_at}",
  "description": "{group.description}",
  "member": [
    { "@type": "Person", "name": "{member.name}" }
  ]
}
```

### SeoService API
```ts
setPage(title: string, description: string, url: string, image?: string): void
setJsonLd(data: object): void
clearJsonLd(): void
```

`setPage()` updates `<title>`, `description` meta, and all OG meta tags in one call. Components call `seoService.setPage(...)` and `seoService.setJsonLd(...)` after data loads.

---

## Section 5: sitemap.xml + robots.txt

### sitemap.xml
Generated by `scripts/generate-routes.mjs` (same script as Section 3) and written to `public/sitemap.xml`.

Structure:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://idol-genealogy.pages.dev/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <!-- one <url> per member -->
  <url>
    <loc>https://idol-genealogy.pages.dev/member/{id}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- one <url> per group -->
  <url>
    <loc>https://idol-genealogy.pages.dev/group/{id}</loc>
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
| `src/index.html` | Modify — lang, title, description, OG tags, canonical |
| `src/app/core/seo.service.ts` | Create — Title, Meta, JSON-LD management |
| `src/app/pages/home/home.component.ts` | Modify — inject SeoService, set WebSite schema |
| `src/app/pages/member-page/member-page.component.ts` | Modify — inject SeoService, set Person schema |
| `src/app/pages/group-page/group-page.component.ts` | Modify — inject SeoService, set MusicGroup schema |
| `scripts/generate-routes.mjs` | Create — queries Supabase, writes prerender-routes.txt + sitemap.xml |
| `angular.json` | Modify — add prerender config |
| `package.json` | Modify — prepend route generation to build script |
| `public/robots.txt` | Create |
| `public/_redirects` | Create (or update) — SPA fallback |

---

## Post-Implementation Checklist

1. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Cloudflare Pages environment variables
2. Trigger a redeploy to verify prerendering works
3. Submit `https://idol-genealogy.pages.dev/sitemap.xml` to Google Search Console
4. Use Google's URL Inspection tool to verify a member page is indexable
