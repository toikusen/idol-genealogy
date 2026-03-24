# SEO Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升 Idol Maps 在搜尋引擎的可見度，讓具體名字搜尋和主題搜尋都能找到網站。

**Architecture:** 分三層改善：(1) 技術基礎 — prerender 補完、sitemap 補完、canonical tag；(2) 自動生成 meta description — runtime 從現有資料組合，不顯示在頁面；(3) Schema 強化 — 豐富 JSON-LD，加入 BreadcrumbList、alternateName、sameAs。

**Tech Stack:** Angular 19 (standalone components), Cloudflare Pages Functions, Supabase, TypeScript

---

## File Map

| 檔案 | 變更 |
|------|------|
| `scripts/generate-routes.mjs` | 補 companies 查詢 + 靜態路由 + company sitemap 條目 |
| `functions/sitemap.xml.ts` | 補 company 個別頁條目 |
| `src/app/core/seo.service.ts` | 加 canonical tag、加 `setJsonLdGraph()` |
| `src/app/pages/member-page/member-page.component.ts` | 豐富描述 + alternateName + sameAs + BreadcrumbList |
| `src/app/pages/group-page/group-page.component.ts` | OG 圖片 + 豐富描述 + image + sameAs + BreadcrumbList |
| `src/app/pages/company-page/company-page.component.ts` | BreadcrumbList |
| `src/app/pages/members-list/members-list.component.ts` | CollectionPage schema |

---

## Task 1: 補完 generate-routes.mjs（Prerender + Sitemap）

**Files:**
- Modify: `scripts/generate-routes.mjs`

目前只產生 member 和 group 路由。需補上：靜態路由、company 動態路由、sitemap 中的 company 條目。

- [ ] **Step 1: 修改 generate-routes.mjs**

將靜態路由清單和 companies 查詢加入，更新 routes 陣列和 sitemap urlEntries：

```js
// 在 groups 查詢之後加入：
const { data: companies, error: companiesError } = await supabase
  .from('companies')
  .select('id, updated_at');
if (companiesError) {
  console.error('Error fetching companies:', companiesError.message);
  process.exit(1);
}

// 更新 routes 陣列：
const routes = [
  '/',
  '/members',
  '/contributors',
  '/guide',
  '/about',
  '/contact',
  '/privacy',
  ...members.map(m => `/member/${m.id}`),
  ...groups.map(g => `/group/${g.id}`),
  ...companies.map(c => `/company/${c.id}`),
];

// 在 urlEntries 的 groups.map 之後加入 companies：
...companies.map(c => `  <url>
  <loc>${SITE_URL}/company/${c.id}</loc>
  <lastmod>${(c.updated_at ?? new Date().toISOString()).slice(0, 10)}</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.6</priority>
</url>`),
```

- [ ] **Step 2: 驗證腳本可執行（需設環境變數）**

```bash
SUPABASE_URL=xxx SUPABASE_ANON_KEY=xxx node scripts/generate-routes.mjs
```

預期輸出：`prerender-routes.txt: N routes written.` 且 N 明顯大於之前（含 company 路由）

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-routes.mjs
git commit -m "feat(seo): add companies and static routes to prerender and sitemap"
```

---

## Task 2: 補完 Cloudflare Sitemap Function

**Files:**
- Modify: `functions/sitemap.xml.ts`

- [ ] **Step 1: 加入 company 查詢和條目**

在 `fetchIds` 呼叫中加入 companies，並在 urls 陣列中加入 `/company/:id`：

```ts
// 修改 onRequest：
const [groupIds, memberIds, companyIds] = await Promise.all([
  fetchIds('groups'),
  fetchIds('members'),
  fetchIds('companies'),
]);

const staticUrls = ['', '/members', '/contributors', '/about', '/contact', '/privacy', '/guide', '/companies'];

const urls = [
  ...staticUrls.map(path => `${SITE}${path}`),
  ...groupIds.map(id => `${SITE}/group/${id}`),
  ...memberIds.map(id => `${SITE}/member/${id}`),
  ...companyIds.map(id => `${SITE}/company/${id}`),
];
```

- [ ] **Step 2: Commit**

```bash
git add functions/sitemap.xml.ts
git commit -m "feat(seo): add company pages and static routes to sitemap"
```

---

## Task 3: SeoService — 加入 canonical tag 和 setJsonLdGraph

**Files:**
- Modify: `src/app/core/seo.service.ts`

- [ ] **Step 1: 加入 canonical 設定和 setJsonLdGraph**

```ts
setPage(pageTitle: string, description: string, url: string, image?: string): void {
  const ogImage = image ?? DEFAULT_OG_IMAGE;
  this.title.setTitle(pageTitle);
  this.meta.updateTag({ name: 'description', content: description });
  this.meta.updateTag({ property: 'og:title', content: pageTitle });
  this.meta.updateTag({ property: 'og:description', content: description });
  this.meta.updateTag({ property: 'og:url', content: url });
  this.meta.updateTag({ property: 'og:image', content: ogImage });
  this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
  this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
  this.meta.updateTag({ name: 'twitter:description', content: description });
  this.meta.updateTag({ name: 'twitter:image', content: ogImage });
  // canonical
  let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = this.doc.createElement('link');
    link.setAttribute('rel', 'canonical');
    this.doc.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

/** Inject multiple JSON-LD schemas as a @graph block */
setJsonLdGraph(schemas: object[]): void {
  this.clearJsonLd();
  const script = this.doc.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'ld-json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': schemas,
  });
  this.doc.head.appendChild(script);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/core/seo.service.ts
git commit -m "feat(seo): add canonical tag and setJsonLdGraph to SeoService"
```

---

## Task 4: Member 頁面 — 豐富描述 + Schema

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.ts`

- [ ] **Step 1: 加入描述生成 helper 和豐富 JSON-LD**

在 `if (member)` 區塊內（約第 118 行），替換 `seo.setPage` 和 `seo.setJsonLd` 呼叫：

```ts
if (member) {
  const displayName = member.name ?? member.name_roman ?? '';
  const romanName = member.name_roman;

  // --- 自動描述（只用於 meta，不顯示在頁面）---
  const groupParts = histories
    .filter(h => h.group || h.external_group_name)
    .sort((a, b) => (a.joined_at ?? '').localeCompare(b.joined_at ?? ''))
    .map(h => {
      const gName = h.group?.name_jp ?? h.group?.name ?? h.external_group_name ?? '';
      const from = h.joined_at ? h.joined_at.slice(0, 4) : null;
      const to = h.left_at ? h.left_at.slice(0, 4) : (h.status === 'active' ? '至今' : null);
      const range = from ? (to ? `${from}–${to}` : from) : '';
      return range ? `${gName}（${range}）` : gName;
    });
  const nameStr = romanName ? `${displayName}（${romanName}）` : displayName;
  const description = groupParts.length > 0
    ? `${nameStr}是台灣地下偶像，曾隸屬${groupParts.join('、')}。`
    : `${displayName}的完整資料，包含所屬團體與活動記錄。`;

  this.seo.setPage(
    `${displayName} - Idol Maps`,
    description,
    `${SITE_URL}/member/${id}`,
    member.photo_url ?? undefined
  );

  // --- JSON-LD ---
  const sameAs: string[] = [
    member.instagram ? `https://instagram.com/${member.instagram}` : null,
    member.facebook ? `https://facebook.com/${member.facebook}` : null,
    member.x ? `https://x.com/${member.x}` : null,
    member.maid_url ?? null,
  ].filter((v): v is string => !!v);

  const personSchema: Record<string, any> = {
    '@type': 'Person',
    name: displayName,
    url: `${SITE_URL}/member/${id}`,
    ...(romanName && { alternateName: romanName }),
    ...(member.nickname && { alternateName: member.nickname }),
    ...(member.birthdate && { birthDate: member.birthdate }),
    ...(member.photo_url && { image: member.photo_url }),
    ...(sameAs.length > 0 && { sameAs }),
  };
  const groupsForSchema = histories
    .filter(h => h.group)
    .map(h => ({ '@type': 'MusicGroup', name: h.group!.name_jp ?? h.group!.name }));
  if (groupsForSchema.length > 0) personSchema['memberOf'] = groupsForSchema;

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: '全部成員', item: `${SITE_URL}/members` },
      { '@type': 'ListItem', position: 3, name: displayName, item: `${SITE_URL}/member/${id}` },
    ],
  };

  this.seo.setJsonLdGraph([personSchema, breadcrumb]);

  // ... 其餘 analytics/viewCount 不變
}
```

> **注意：** `member.nickname` 欄位需確認存在於 `Member` model。若無此欄位，省略 `alternateName: member.nickname` 那行。

- [ ] **Step 2: 確認 build 無錯誤**

```bash
ng build --configuration development 2>&1 | tail -20
```

預期：無 TypeScript 錯誤

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/member-page/member-page.component.ts
git commit -m "feat(seo): enrich member page description, JSON-LD and add BreadcrumbList"
```

---

## Task 5: Group 頁面 — OG 圖片 + 豐富描述 + Schema

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts`

- [ ] **Step 1: 替換 seo.setPage 和 seo.setJsonLd 區塊**（約第 175–196 行）

```ts
if (group) {
  const displayName = group.name_jp ?? group.name;

  // --- 自動描述 ---
  const activeCount = histories.filter(h => h.status === 'active').length;
  const parts: string[] = [];
  if (group.founded_at) parts.push(`成立於 ${group.founded_at.slice(0, 4)} 年`);
  if (activeCount > 0) parts.push(`現有 ${activeCount} 名活躍成員`);
  if (this.companyName) parts.push(`隸屬 ${this.companyName}`);
  const description = parts.length > 0
    ? `${displayName}，${parts.join('，')}。`
    : `${displayName}的成員組成與活動記錄。`;

  this.seo.setPage(
    `${displayName} - Idol Maps`,
    description,
    `${SITE_URL}/group/${id}`,
    group.photo_url ?? undefined   // ← 補上 OG 圖片
  );

  // --- JSON-LD ---
  const sameAs: string[] = [
    group.instagram ? `https://instagram.com/${group.instagram}` : null,
    group.facebook ? `https://facebook.com/${group.facebook}` : null,
    group.x ? `https://x.com/${group.x}` : null,
    group.youtube ?? null,
  ].filter((v): v is string => !!v);

  const musicGroupSchema: Record<string, any> = {
    '@type': 'MusicGroup',
    name: displayName,
    url: `${SITE_URL}/group/${id}`,
    ...(group.founded_at && { foundingDate: group.founded_at }),
    ...(group.photo_url && { image: group.photo_url }),
    ...(sameAs.length > 0 && { sameAs }),
  };
  const members = histories
    .filter(h => h.member)
    .map(h => ({ '@type': 'Person', name: h.member!.name ?? h.member!.name_roman }));
  if (members.length > 0) musicGroupSchema['member'] = members;

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: displayName, item: `${SITE_URL}/group/${id}` },
    ],
  };

  this.seo.setJsonLdGraph([musicGroupSchema, breadcrumb]);

  // ... analytics/viewCount 不變
}
```

> **注意：** `companyName` 在 group-page 是非同步載入的（see component state）。描述生成時若 `companyName` 尚未取得，`parts` 中不會包含公司資訊，這是預期行為（prerender 時公司名稱可能來不及）。若要確保 prerender 包含公司名，可將 SEO 設定移至 companyName 也 resolve 後。請確認現有 `companyName` 載入流程再決定是否調整順序。

- [ ] **Step 2: 確認 build 無錯誤**

```bash
ng build --configuration development 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/group-page/group-page.component.ts
git commit -m "feat(seo): enrich group page OG image, description, JSON-LD and BreadcrumbList"
```

---

## Task 6: Company 頁面 — BreadcrumbList

**Files:**
- Modify: `src/app/pages/company-page/company-page.component.ts`

company-page 的 description 已有正確 fallback（`company.description ?? 旗下團體…`），只需加入 BreadcrumbList。

- [ ] **Step 1: 將 setJsonLd 替換為 setJsonLdGraph**（約第 80–86 行）

```ts
const orgSchema: Record<string, any> = {
  '@type': 'Organization',
  name: company.name,
  url: `${SITE_URL}/company/${id}`,
  ...(company.photo_url ? { logo: company.photo_url } : {}),
};

const breadcrumb = {
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: company.name, item: `${SITE_URL}/company/${id}` },
  ],
};

this.seo.setJsonLdGraph([orgSchema, breadcrumb]);
```

並移除原本的 `this.seo.setJsonLd({...})` 呼叫（以及頂部的 `this.seo.clearJsonLd?.()` 若已改用 setJsonLdGraph 就不再需要）。

- [ ] **Step 2: 確認 build 無錯誤**

```bash
ng build --configuration development 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/company-page/company-page.component.ts
git commit -m "feat(seo): add BreadcrumbList schema to company page"
```

---

## Task 7: Members List 頁面 — CollectionPage Schema

**Files:**
- Modify: `src/app/pages/members-list/members-list.component.ts`

- [ ] **Step 1: 在 setPage 之後加入 setJsonLdGraph**

找到現有的 `this.seo.setPage(...)` 呼叫，在其後加入：

```ts
this.seo.setJsonLdGraph([
  {
    '@type': 'CollectionPage',
    name: '全部成員',
    url: 'https://idolmaps.com/members',
    description: '台灣地下偶像所有成員一覽',
  },
  {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: 'https://idolmaps.com/' },
      { '@type': 'ListItem', position: 2, name: '全部成員', item: 'https://idolmaps.com/members' },
    ],
  },
]);
```

- [ ] **Step 2: 確認 build 無錯誤**

```bash
ng build --configuration development 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/members-list/members-list.component.ts
git commit -m "feat(seo): add CollectionPage and BreadcrumbList schema to members list"
```

---

## Task 8: 最終驗證

- [ ] **Step 1: 完整 build**

```bash
npm run build 2>&1 | tail -30
```

預期：build 成功，無錯誤

- [ ] **Step 2: 確認 prerender-routes.txt 包含 company 路由**

```bash
grep "/company/" prerender-routes.txt | head -5
grep "/members" prerender-routes.txt
grep "/about" prerender-routes.txt
```

預期：有 company UUID 路由、有 /members、有 /about

- [ ] **Step 3: 確認 public/sitemap.xml 包含 company 條目**

```bash
grep "/company/" public/sitemap.xml | head -5
```

預期：有 company UUID 路由

- [ ] **Step 4: 用 Google Rich Results Test 驗證 JSON-LD**（手動）

部署後，至 [https://search.google.com/test/rich-results](https://search.google.com/test/rich-results) 測試任一成員頁和團體頁，確認 Person / MusicGroup / BreadcrumbList 皆被正確識別。

- [ ] **Step 5: Final commit（若有任何小修正）**

```bash
git add -p
git commit -m "fix(seo): final adjustments from validation"
```
