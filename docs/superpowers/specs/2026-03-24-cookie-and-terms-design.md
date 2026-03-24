# Cookie 同意橫幅 & 使用條款 Design — 2026-03-24

## Goal

為 Idol Maps 加入兩項 AdSense 審核所需的合規功能：
1. **Cookie 同意橫幅** — 告知使用者本站使用 Cookie 及廣告
2. **使用條款頁面** — 說明使用規範、投稿授權、廣告與免責聲明

---

## 區塊一：Cookie 同意橫幅

### 元件

新增 `CookieBannerComponent`（standalone）：
- 路徑：`src/app/shared/cookie-banner/cookie-banner.component.ts`
- 樣式：底部置中浮動卡片，符合網站粉紫色調（與現有 inline style 慣例一致）
- 行動裝置：`max-width: 26rem` 卡片，小螢幕改為全寬並貼底

### 行為

- 首次造訪時顯示
- 點「我了解，繼續瀏覽」後：
  - 寫入 `localStorage.setItem('cookie_consent', 'accepted')`
  - 元件隱藏（`ngIf` 控制）
- 頁面重整後讀取 localStorage，若已同意則不顯示

### 整合

在 `app.component.html` 最底層加入 `<app-cookie-banner>`

### 視覺規格

```
┌─────────────────────────────────────┐
│ 本網站使用 Cookie 以提升瀏覽體驗及   │
│ 顯示相關廣告。繼續使用即表示您同意   │
│ 我們的 [隱私權政策]。               │
│                                     │
│    [我了解，繼續瀏覽]               │
└─────────────────────────────────────┘
```

- 背景：`#fff`，border `rgba(232,121,160,0.25)`，`border-radius: 12px`
- 按鈕：`linear-gradient(135deg, #e879a0, #c84a87)`，白色文字
- 隱私權政策：`color: #e879a0`，連結至 `/privacy`
- 位置：`position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%)`
- z-index：100（高於一般內容，低於 modal）
- 行動裝置（< 640px）：`left: 12px; right: 12px; transform: none; bottom: 12px`

---

## 區塊二：使用條款頁面

### 路由

- 路徑：`/terms`
- Component：`src/app/pages/terms/terms.component.ts` + `.html`
- 加入 `app.routes.ts` lazy load
- 加入 SEO：`seo.setPage('使用條款 | Idol Maps', '...', 'https://idolmaps.com/terms')`

### 內容章節（繁體中文）

1. **服務說明**
   - Idol Maps 是台灣地下偶像資料庫，提供成員、團體、公司資料查詢
   - 資料由社群貢獻與編輯團隊共同維護

2. **使用規範**
   - 禁止提交明知為虛假或惡意的資料
   - 禁止任何形式的系統濫用或自動化攻擊

3. **用戶投稿內容**
   - 提交提案即授權 Idol Maps 使用、修改及發布該內容
   - 使用者應確保提交資料的來源合法，不侵犯他人著作權或隱私權
   - 本站保留拒絕或刪除任何提案的權利

4. **廣告聲明**
   - 本站使用 Google AdSense 顯示廣告
   - 廣告內容由 Google 決定，本站不對廣告內容負責
   - 如需停用個人化廣告，請參閱 [隱私權政策](/privacy)

5. **免責聲明**
   - 本站資料以現有公開來源為準，不保證完全正確或即時更新
   - 本站不對因使用本站資料所造成的任何損失負責

6. **著作權**
   - 網站設計、程式碼及原創內容為 Idol Maps 所有
   - 偶像相關公開資訊（姓名、所屬團體等）屬公開事實，不構成著作權侵害

7. **條款變更**
   - 本站保留隨時修改條款的權利，修改後繼續使用即表示同意

### 頁面樣式

沿用現有頁面風格（與 `/privacy` 頁面相同的版型）：
- `font-family: 'JF Openhuninn'`
- 章節標題用粉紅色
- 最後更新日期顯示於頂部

### 連結入口

在 `/privacy` 頁面底部加入「使用條款」連結（`routerLink="/terms"`）

---

## 影響範圍

| 檔案 | 變更 |
|------|------|
| `src/app/shared/cookie-banner/cookie-banner.component.ts` | 新建 |
| `src/app/shared/cookie-banner/cookie-banner.component.html` | 新建 |
| `src/app/app.component.html` | 加入 `<app-cookie-banner>` |
| `src/app/app.component.ts` | import CookieBannerComponent |
| `src/app/pages/terms/terms.component.ts` | 新建 |
| `src/app/pages/terms/terms.component.html` | 新建 |
| `src/app/app.routes.ts` | 加入 `/terms` 路由 |
| `src/app/pages/privacy/privacy.component.html` | 加入使用條款連結 |

---

## 不在範圍內

- Cookie 細項管理（接受/拒絕分類）— 超出 AdSense 基本需求
- 多語言版本
- 後端儲存同意記錄
