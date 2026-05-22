# Plan 1: PWA + Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓網站可安裝為 PWA（iOS + Android），並在未登入時顯示登入按鈕。

**Architecture:** 使用 `ng add @angular/pwa` 安裝 Angular 官方 Service Worker，手動補 iOS meta tags 和 SSR 安全初始化。在 `app.component.html` 加入未登入時的登入 Pill，使用現有 `session$` observable 的 `@else` 分支。

**Tech Stack:** `@angular/service-worker`, `@angular/pwa`, Angular 19 Standalone, Supabase Auth

---

## File Map

| 動作 | 檔案 |
|------|------|
| Create (CLI) | `src/manifest.webmanifest` |
| Create (CLI) | `src/ngsw-config.json` |
| Modify | `src/index.html` |
| Modify | `src/app/app.config.ts` |
| Modify | `src/app/app.component.html` |

---

### Task 1: 安裝 @angular/pwa

**Files:**
- Create: `src/manifest.webmanifest`
- Create: `src/ngsw-config.json`
- Modify: `src/index.html`
- Modify: `src/app/app.config.ts`
- Modify: `package.json`

- [ ] **Step 1: 在專案根目錄執行安裝**

```bash
cd /Users/seitumbp2025/idol-genealogy
npx ng add @angular/pwa --skip-confirmation
```

Expected output 包含：
```
CREATE src/manifest.webmanifest
CREATE src/ngsw-config.json
UPDATE src/app/app.config.ts
UPDATE src/index.html
```

- [ ] **Step 2: 確認生成的 app.config.ts 有 provideServiceWorker**

```bash
grep -n "provideServiceWorker\|ServiceWorker" src/app/app.config.ts
```

Expected：有 `provideServiceWorker('ngsw-worker.js', ...)` 這行。

---

### Task 2: 修正 SSR 相容性

**Files:**
- Modify: `src/app/app.config.ts`

- [ ] **Step 1: 讀取 ng add 生成的 app.config.ts，找到 provideServiceWorker 的行**

- [ ] **Step 2: 將 provideServiceWorker 包在 browser 判斷中**

完整的 `src/app/app.config.ts`：

```typescript
import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';

const isBrowser = typeof window !== 'undefined';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(),
    provideClientHydration(),
    ...(isBrowser
      ? [provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() })]
      : []),
  ]
};
```

- [ ] **Step 3: 確認 build 不報 SSR 錯誤**

```bash
npm run build 2>&1 | tail -20
```

Expected：無 `window is not defined` 或 `navigator` 相關錯誤。

---

### Task 3: 自訂 manifest.webmanifest

**Files:**
- Modify: `src/manifest.webmanifest`

- [ ] **Step 1: 覆寫 manifest 為符合網站設計的設定**

`src/manifest.webmanifest`：

```json
{
  "name": "偶像家系圖",
  "short_name": "偶像家系圖",
  "theme_color": "#e879a0",
  "background_color": "#fdf6fa",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "icons": [
    {
      "src": "icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ]
}
```

- [ ] **Step 2: 產生 PWA icons**

至 https://maskable.app/editor 上傳 logo，或使用 realfavicongenerator.net 產生所有尺寸。

將 icon 檔案放到 `public/icons/` 資料夾：

```bash
ls public/icons/
# 預期：icon-72x72.png icon-96x96.png icon-128x128.png icon-144x144.png
#       icon-152x152.png icon-192x192.png icon-384x384.png icon-512x512.png
```

> **注意**：`@angular/pwa` 預設在 `src/assets/icons/` 產生佔位圖，但本專案靜態資源在 `public/`。確認 `angular.json` 的 assets 設定包含 `public`（已有）。

---

### Task 4: 設定 ngsw-config.json 快取策略

**Files:**
- Modify: `src/ngsw-config.json`

- [ ] **Step 1: 覆寫快取設定，App shell prefetch、靜態資源 lazy、API 不快取**

`src/ngsw-config.json`：

```json
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app-shell",
      "installMode": "prefetch",
      "resources": {
        "files": [
          "/favicon.ico",
          "/index.html",
          "/manifest.webmanifest",
          "/*.css",
          "/*.js"
        ]
      }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/icons/**",
          "/**/*.png",
          "/**/*.jpg",
          "/**/*.svg",
          "/**/*.woff2"
        ]
      }
    }
  ],
  "dataGroups": []
}
```

> `dataGroups` 留空：Supabase API 請求不快取，保持資料永遠最新。

---

### Task 5: 補充 iOS meta tags

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: 在 `<head>` 區塊中加入 iOS PWA 所需的 meta tags**

在 `src/index.html` 的 `<head>` 內找到 `ng add` 加入的 `<link rel="manifest">` 那行，在其後加入：

```html
  <!-- iOS PWA support -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="偶像家系圖">
  <link rel="apple-touch-icon" href="icons/icon-192x192.png">
```

- [ ] **Step 2: 確認 manifest link 已正確存在**

```bash
grep -n "manifest\|apple-mobile" src/index.html
```

Expected：同時看到 `manifest.webmanifest` 和 `apple-mobile-web-app-capable`。

---

### Task 6: 加入未登入時的登入 Pill

**Files:**
- Modify: `src/app/app.component.html`

- [ ] **Step 1: 在 app.component.html 找到現有的 `@if ((session$ | async); as session)` 區塊**

```bash
grep -n "session\$\|user-pill\|my-contributions" src/app/app.component.html
```

- [ ] **Step 2: 在 `@if` 區塊後加入 `@else` 分支，顯示登入 Pill**

找到以下結構：

```html
@if ((session$ | async); as session) {
  @if (!isAdminRoute) {
    <div class="user-pill" ...>
      <a routerLink="/my-contributions" ...>
```

在整個 `@if ((session$ | async); as session) { ... }` 區塊的結尾 `}` 後加入：

```html
@else {
  @if (!isAdminRoute) {
    <a routerLink="/login" style="
      position: fixed;
      bottom: 16px;
      left: 16px;
      z-index: 1000;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      background: rgba(255,255,255,0.82);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(232,121,160,0.2);
      border-radius: 20px;
      box-shadow: 0 2px 10px rgba(45,27,46,0.08);
      font-size: 0.7rem;
      font-family: var(--font-sans);
      color: var(--text-faint-75);
      text-decoration: none;
      letter-spacing: 0.05em;
      cursor: pointer;
    ">
      <span style="width:6px;height:6px;border-radius:50%;background:rgba(232,121,160,0.5);flex-shrink:0;"></span>
      登入
    </a>
  }
}
```

- [ ] **Step 3: 啟動 dev server，以無痕視窗開啟確認**

```bash
npm start
```

開啟 http://localhost:4200（無痕視窗 = 未登入），確認左下角出現「登入」按鈕，點擊後導到 `/login`。

---

### Task 7: Commit

- [ ] **Step 1: 暫存所有異動**

```bash
cd /Users/seitumbp2025/idol-genealogy
git add src/manifest.webmanifest src/ngsw-config.json src/index.html \
        src/app/app.config.ts src/app/app.component.html \
        package.json package-lock.json
```

- [ ] **Step 2: 確認沒有不相關檔案被加入**

```bash
git status
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(pwa): add PWA manifest, service worker, iOS tags, and login pill"
```

---

## 驗證清單

完成後確認：

- [ ] Chrome DevTools > Application > Manifest 顯示正確 App 名稱和 icon
- [ ] Chrome DevTools > Application > Service Workers 顯示 ngsw-worker.js 已啟動
- [ ] Android Chrome 顯示「加入主畫面」提示
- [ ] iOS Safari > 分享 > 加入主畫面 可成功安裝
- [ ] 未登入時左下角顯示「登入」按鈕
- [ ] 登入後左下角顯示使用者名稱（原有行為）
- [ ] SSR build 無 window/navigator 錯誤

---

**下一步：** Plan 2 — 最愛系統（DB + Service + UI）
