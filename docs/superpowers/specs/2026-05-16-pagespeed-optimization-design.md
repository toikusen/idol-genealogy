# PageSpeed Optimization Design

**Date:** 2026-05-16  
**Scope:** Desktop FCP/SI/LCP 改善，不影響既有功能  
**Target:** LCP < 4s，FCP < 2s，SI < 4s

---

## 問題診斷

現況（PageSpeed Insights）：

| 指標 | Desktop | Mobile |
|------|---------|--------|
| FCP  | 差      | 通過   |
| SI   | 差      | 通過   |
| LCP  | 14s（極差） | 通過 |

Desktop 差、Mobile 通過，說明 SSR 預渲染正常，問題在資源載入順序。

**根因分析：**

1. **LCP 14s 主因**：`topMembers[0]` / `topGroups[0]` 的 Supabase 圖片用了 `loading="lazy"`。桌面視窗大，這些圖片是首屏可見的 LCP 候選，但 lazy loading 告訴瀏覽器低優先度載入 → LCP 暴增。
2. **FCP/SI 次因**：2.1MB 中文字體沒有 `<link rel="preload">`，瀏覽器需等待 CSS 解析完才發現字體，延遲開始下載。字體有 `font-display: swap` 所以不阻塞渲染，但 swap 時機晚影響 SI。
3. **HTTP 層**：`provideHttpClient()` 缺少 `withFetch()`，SSR hydration 無法使用 native fetch cache。
4. **OG 圖片**：`og-default.png` 2.9MB，雖不影響頁面 LCP，但浪費頻寬（此修改可選）。

---

## 架構設計

### 修改範圍

四個檔案，每個修改都是獨立的：

| 檔案 | 修改內容 | 優先度 |
|------|---------|--------|
| `src/index.html` | 加字體 preload link | P0 |
| `src/app/pages/home/home.component.html` | topMembers[0]/topGroups[0] 圖片改 eager + fetchpriority=high | P0 |
| `src/app/app.config.ts` | `provideHttpClient(withFetch())` | P1 |
| `public/og-default.png` | 壓縮或轉 WebP（build script） | P2 |

### 不動的部分

- Leaflet CSS 留在 `angular.json` styles（14KB，移出複雜度高於效益）
- 字體子集化不做（內容動態，切字元集風險高）
- SSR 架構不變（Netlify 靜態預渲染正常）

---

## 詳細設計

### Fix 1：字體 preload（`src/index.html`）

在 `<head>` 最上方加入：

```html
<link rel="preload" as="font" type="font/woff2"
      href="/fonts/jf-openhuninn-2.1.woff2" crossorigin>
```

**位置**：放在 `<meta charset>` 後、其他資源前，確保最高發現優先度。

**效益**：瀏覽器在解析 HTML 時立即開始下載字體，不需等待 CSS 解析。

### Fix 2：LCP 圖片 eager loading（`home.component.html`）

目標元素：

```
熱門排行 → topMembers 迴圈（line ~430）→ 第一個圖片
熱門排行 → topGroups 迴圈（line ~452）→ 第一個圖片
```

修改方式：

```html
<!-- Before -->
<img loading="lazy" [src]="entry.photo_url | supabaseImg:128" ...>

<!-- After (index 0) -->
<img [loading]="i === 0 ? 'eager' : 'lazy'"
     [attr.fetchpriority]="i === 0 ? 'high' : null"
     [src]="entry.photo_url | supabaseImg:128" ...>
```

**原理**：`loading="eager"` 取消延遲，`fetchpriority="high"` 告訴瀏覽器這是高優先度資源，優先於其他圖片下載。

**考慮點**：
- `fetchpriority` 為 HTML 原生屬性，Angular 需用 `[attr.fetchpriority]` 綁定
- 只針對 `i === 0`（第一個熱門成員/團體），其餘保持 lazy
- 若 `topMembers`/`topGroups` 為空陣列，這些圖片不存在，不影響

### Fix 3：`withFetch()`（`src/app/app.config.ts`）

```typescript
// Before
provideHttpClient()

// After
provideHttpClient(withFetch())
```

`withFetch()` 讓 Angular HttpClient 使用 native `fetch()` API，SSR 環境下支援 HTTP cache header，避免 hydration 重複發送相同 API 請求。

### Fix 4：OG 圖片壓縮（可選 P2）

`og-default.png` 2.9MB 可壓縮至 < 300KB（WebP + 適當解析度）。

方案：
- 用 `sharp`（已在 devDependencies）寫一個 `scripts/optimize-og.mjs`
- 或直接替換成壓縮過的 PNG/WebP

不影響頁面效能指標（OG 圖片不是頁面資源），但節省社群分享時的頻寬。

---

## 測試計畫

- [ ] 修改後 `ng build` 無錯誤
- [ ] Dev server 驗證首頁載入：熱門排行圖片應立即顯示（不延遲）
- [ ] Chrome DevTools Network → 確認 `jf-openhuninn-2.1.woff2` 出現在 Initiator: `<link rel=preload>` 而非 CSS
- [ ] Chrome DevTools Performance → LCP 元素應為首位熱門成員圖片，載入時間應 < 4s（本地 fast 3G throttle 測試）
- [ ] 確認其他頁面（member page, group page）載入正常，無 hydration 錯誤

---

## 風險評估

| 修改 | 風險 | 緩解 |
|------|------|------|
| eager LCP 圖片 | Supabase 圖片本身慢（cold cache） | 這是 CDN 層問題，無法 code 改善；但至少移除人為延遲 |
| withFetch() | HttpClient 行為微變 | 標準 Angular 推薦設定，無已知破壞性變更 |
| 字體 preload | 無 | `crossorigin` 屬性必填（字體 CORS 要求） |
