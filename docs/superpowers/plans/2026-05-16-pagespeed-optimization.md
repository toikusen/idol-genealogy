# PageSpeed Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 desktop LCP 14s / FCP 差 / SI 差，不影響現有功能。

**Architecture:** 三個獨立修改：(1) `index.html` 加字體 preload hint；(2) `home.component.html` 首個 topMember/topGroup 圖片改 eager + fetchpriority=high；(3) `app.config.ts` 加 `withFetch()`。

**Tech Stack:** Angular 19 standalone, Angular SSR (prerender), Netlify, Jasmine/Karma

---

## File Map

| 檔案 | 變更 |
|------|------|
| `src/index.html` | 加 `<link rel="preload">` 字體 hint |
| `src/app/pages/home/home.component.html` | topMembers/topGroups 第一張圖改 eager |
| `src/app/pages/home/home.component.spec.ts` | 加 LCP 圖片屬性測試 |
| `src/app/app.config.ts` | 加 `withFetch()` |

---

## Task 1：字體 Preload

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1：加 preload link**

在 `src/index.html` 的 `<head>` 區段，`<meta charset="utf-8">` 之後立即插入：

```html
<link rel="preload" as="font" type="font/woff2"
      href="/fonts/jf-openhuninn-2.1.woff2" crossorigin>
```

完整位置（插在第 3 行後）：

```html
<head>
  <meta charset="utf-8">
  <link rel="preload" as="font" type="font/woff2"
        href="/fonts/jf-openhuninn-2.1.woff2" crossorigin>
  <script>
    (function(){
      var t=localStorage.getItem('theme');
      ...
```

**注意：** `crossorigin` 屬性必填，字體跨域請求若缺少此屬性，preload 會被瀏覽器忽略。

- [ ] **Step 2：驗證 preload 出現在正確位置**

```bash
grep -n "preload" src/index.html
```

預期輸出（行號可能稍不同）：
```
3:  <link rel="preload" as="font" type="font/woff2"
```

- [ ] **Step 3：Commit**

```bash
git add src/index.html
git commit -m "perf(index): preload custom font to improve FCP"
```

---

## Task 2：LCP 圖片 Eager Loading（TDD）

**Files:**
- Modify: `src/app/pages/home/home.component.html`
- Test: `src/app/pages/home/home.component.spec.ts`

### Step 1：先寫失敗測試

- [ ] **Step 1.1：在 `home.component.spec.ts` 補充 import**

找到第 10 行的 models import：

```typescript
import { Group, Member, Company } from '../../models';
```

改為：

```typescript
import { Group, Member, Company, MemberLeaderboardEntry, GroupLeaderboardEntry } from '../../models';
```

- [ ] **Step 1.2：在 `home.component.spec.ts` 加測試 describe block**

在檔案末尾（最後一個 `});` 之前）加入以下測試群組：

```typescript
// ── LCP image loading attributes ──────────────────────────────────────────
describe('LCP image loading (popular rank)', () => {
  function leaderMember(id: string, photoUrl: string): MemberLeaderboardEntry {
    return { id, name: id, name_roman: null, photo_url: photoUrl, color: null, view_count: 1 };
  }

  function leaderGroup(id: string, photoUrl: string): GroupLeaderboardEntry {
    return { id, name: id, photo_url: photoUrl, color: null, view_count: 1 };
  }

  it('first topMember image uses loading=eager and fetchpriority=high', fakeAsync(async () => {
    await setup({}, {}, {}, {
      topMembers: [
        leaderMember('m1', 'https://ziiagdrrytyrmzoeegjk.supabase.co/storage/v1/object/public/members/m1.jpg'),
        leaderMember('m2', 'https://ziiagdrrytyrmzoeegjk.supabase.co/storage/v1/object/public/members/m2.jpg'),
      ],
      topGroups: [],
    });
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const imgs = el.querySelectorAll<HTMLImageElement>('.popular-rank-img');

    expect(imgs.length).toBeGreaterThanOrEqual(2);
    expect(imgs[0].getAttribute('loading')).toBe('eager');
    expect(imgs[0].getAttribute('fetchpriority')).toBe('high');
    expect(imgs[1].getAttribute('loading')).toBe('lazy');
    expect(imgs[1].getAttribute('fetchpriority')).toBeNull();

    discardPeriodicTasks();
  }));

  it('first topGroup image uses loading=eager and fetchpriority=high', fakeAsync(async () => {
    await setup({}, {}, {}, {
      topMembers: [],
      topGroups: [
        leaderGroup('g1', 'https://ziiagdrrytyrmzoeegjk.supabase.co/storage/v1/object/public/groups/g1.jpg'),
        leaderGroup('g2', 'https://ziiagdrrytyrmzoeegjk.supabase.co/storage/v1/object/public/groups/g2.jpg'),
      ],
    });
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const imgs = el.querySelectorAll<HTMLImageElement>('.popular-rank-img');

    expect(imgs.length).toBeGreaterThanOrEqual(2);
    expect(imgs[0].getAttribute('loading')).toBe('eager');
    expect(imgs[0].getAttribute('fetchpriority')).toBe('high');
    expect(imgs[1].getAttribute('loading')).toBe('lazy');
    expect(imgs[1].getAttribute('fetchpriority')).toBeNull();

    discardPeriodicTasks();
  }));
});
```

- [ ] **Step 1.3：確認測試失敗**

```bash
npx ng test --include="**/home.component.spec.ts" --watch=false 2>&1 | grep -E "FAILED|PASSED|ERROR|LCP"
```

預期：測試 `FAILED`（因為模板目前全部 `loading="lazy"`）

---

### Step 2：修改模板

- [ ] **Step 2.1：修改 topMembers 迴圈中的圖片（`home.component.html` 約第 429-432 行）**

找到 topMembers 段落：

```html
@for (entry of topMembers; track entry.id; let i = $index) {
  <li>
    <a [routerLink]="'/member/' + entry.id" class="popular-rank-link"
       style="...">
      <span ...>{{ i + 1 }}.</span>
      @if (entry.photo_url) {
        <img loading="lazy"
             [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="64" height="64"
             class="popular-rank-img" style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
      }
```

改為：

```html
@for (entry of topMembers; track entry.id; let i = $index) {
  <li>
    <a [routerLink]="'/member/' + entry.id" class="popular-rank-link"
       style="...">
      <span ...>{{ i + 1 }}.</span>
      @if (entry.photo_url) {
        <img [loading]="i === 0 ? 'eager' : 'lazy'"
             [attr.fetchpriority]="i === 0 ? 'high' : null"
             [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="64" height="64"
             class="popular-rank-img" style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
      }
```

- [ ] **Step 2.2：修改 topGroups 迴圈中的圖片（`home.component.html` 約第 451-454 行）**

找到 topGroups 段落：

```html
@for (entry of topGroups; track entry.id; let i = $index) {
  <li>
    <a [routerLink]="'/group/' + entry.id" class="popular-rank-link"
       style="...">
      <span ...>{{ i + 1 }}.</span>
      @if (entry.photo_url) {
        <img loading="lazy"
             [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="64" height="64"
             class="popular-rank-img" style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
      }
```

改為：

```html
@for (entry of topGroups; track entry.id; let i = $index) {
  <li>
    <a [routerLink]="'/group/' + entry.id" class="popular-rank-link"
       style="...">
      <span ...>{{ i + 1 }}.</span>
      @if (entry.photo_url) {
        <img [loading]="i === 0 ? 'eager' : 'lazy'"
             [attr.fetchpriority]="i === 0 ? 'high' : null"
             [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="64" height="64"
             class="popular-rank-img" style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
      }
```

- [ ] **Step 2.3：跑測試確認通過**

```bash
npx ng test --include="**/home.component.spec.ts" --watch=false 2>&1 | grep -E "FAILED|PASSED|ERROR|LCP|Executed"
```

預期：所有測試 PASSED。若有 FAILED，確認屬性名稱拼寫正確（`fetchpriority` 全小寫）。

- [ ] **Step 2.4：Commit**

```bash
git add src/app/pages/home/home.component.html src/app/pages/home/home.component.spec.ts
git commit -m "perf(home): eager-load first popular rank images to fix desktop LCP"
```

---

## Task 3：HttpClient withFetch()

**Files:**
- Modify: `src/app/app.config.ts`

- [ ] **Step 3.1：加入 `withFetch`**

將 `src/app/app.config.ts` 改為：

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withFetch()), provideClientHydration()
  ]
};
```

唯一變更：
- `import` 加 `withFetch`
- `provideHttpClient()` 改為 `provideHttpClient(withFetch())`

- [ ] **Step 3.2：Build 驗證**

```bash
npm run build 2>&1 | tail -20
```

預期：`Build at:` 行出現，無 ERROR。

- [ ] **Step 3.3：Commit**

```bash
git add src/app/app.config.ts
git commit -m "perf(http): use native fetch for HttpClient to enable SSR HTTP cache"
```

---

## Task 4：完整測試驗證

- [ ] **Step 4.1：跑全套測試**

```bash
npx ng test --watch=false 2>&1 | tail -10
```

預期：`Executed X of X SUCCESS`，無 FAILED。

- [ ] **Step 4.2：Build 並確認 bundle 無增大**

```bash
npm run build 2>&1 | grep -E "Initial|Lazy|chunk"
```

確認 initial bundle 大小沒有明顯增加（這三個修改都不增加 JS bundle）。

- [ ] **Step 4.3：Dev server 視覺驗證**

```bash
npm start
```

開啟 http://localhost:4200，Chrome DevTools → Network tab → 篩選 `jf-openhuninn`。

確認：
- 字體的 Initiator 應為 `<link rel=preload>` 而非 `Other`
- 首頁熱門成員/團體的第一張圖片 Initiator 應較早出現（不是 lazy deferred）

- [ ] **Step 4.4：最終 commit（若有未提交的小改動）**

```bash
git status
# 若全部 clean，跳過此步
```
