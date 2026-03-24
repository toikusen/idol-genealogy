# SEO Improvements Design — 2026-03-24

## Goal

讓更多人能透過搜尋引擎找到 Idol Maps，包含：
- **具體名字搜尋**（如「山田花子 偶像」「AKB48 台灣」）
- **主題搜尋**（如「台灣地下偶像」「台灣偶像資料庫」）

自動生成的描述文字**只用於 meta description / JSON-LD**，不顯示在頁面 UI 上，以維持設計品質並避免維護負擔（因為是 runtime 從現有資料動態生成，資料更新後自動反映）。

---

## 區塊一：技術修補

### 1. Prerender 補完

**現狀：** `prerender-routes.txt` 只有 `/`，所有成員、團體、公司頁面僅靠 SSR（需要 JS 執行）。

**做法：** 修改 `scripts/generate-routes.mjs`，在 build 前從 Supabase 抓取所有 member、group、company 的 ID，寫入 `prerender-routes.txt`：

```
/
/members
/contributors
/guide
/about
/contact
/privacy
/member/uuid-1
/member/uuid-2
...
/group/uuid-1
...
/company/uuid-1
...
```

預先渲染的 HTML 讓 Googlebot 不需要執行 JS 就能讀到完整內容。

### 2. Sitemap 補 company 個別頁面

**現狀：** `functions/sitemap.xml.ts` 只有 `/companies`（清單頁），沒有 `/company/:id`。

**做法：** 在 sitemap function 中和 members/groups 一樣，查詢所有 company ID 並生成 `/company/{id}` 條目。

### 3. 所有動態頁補 canonical tag

**現狀：** `SeoService.setPage()` 設定 OG URL 但沒有設定 `<link rel="canonical">`，只有 `index.html` 有寫死的 canonical。

**做法：** 在 `SeoService.setPage()` 中加入動態設定 canonical tag，確保每頁都有正確的 canonical 指向自己。

### 4. Group 頁面補 OG 圖片

**現狀：** `group-page.component.ts` 呼叫 `seo.setPage()` 時沒有傳入圖片。

**做法：** 傳入 `group.photo_url ?? undefined`，與 member 頁和 company 頁一致。

---

## 區塊二：自動生成 meta description

在各頁面 component 中，從現有資料動態組合 description 字串，傳入 `seo.setPage()`。不顯示在頁面上。

### 成員頁（`member-page.component.ts`）

從 history 資料組合所屬團體清單：

```
{name}（{name_roman}）是台灣地下偶像，{曾隸屬 A（YYYY–YYYY）、現隸屬 B（YYYY–至今）}。
```

- 若有多個團體，依時間排序列出
- 若無歷程資料，fallback：`{name} 的完整資料，包含所屬團體與活動記錄。`

### 團體頁（`group-page.component.ts`）

```
{name} 成立於 {founded_at 年份}，{現有 N 名活躍成員}，{隸屬 XXX 公司}。
```

- 若無成立年份或公司資料，省略對應片段
- 若無任何資料可用，fallback：`{name} 的成員組成與活動記錄。`

### 公司頁（`company-page.component.ts`）

- 優先使用 `company.description` 欄位（已存在）
- 若為空，fallback：`{name} 旗下偶像團體與成員完整記錄。`

---

## 區塊三：Schema 強化

### 成員 JSON-LD（Person）

新增欄位：
- `alternateName`：nickname（若有）
- `sameAs`：instagram / facebook / x / maid_url 的完整 URL 陣列

### 團體 JSON-LD（MusicGroup）

新增欄位：
- `image`：`group.photo_url`
- `sameAs`：instagram / facebook / x / youtube 的完整 URL 陣列

### BreadcrumbList（所有詳細頁）

在成員、團體、公司詳細頁加入 BreadcrumbList schema：

- 成員：首頁 > 全部成員 > {成員名}
- 團體：首頁 > {團體名}
- 公司：首頁 > {公司名}

### CollectionPage（`/members`）

`members-list.component.ts` 加入 CollectionPage schema：

```json
{
  "@type": "CollectionPage",
  "name": "全部成員",
  "url": "https://idolmaps.com/members",
  "description": "台灣地下偶像所有成員一覽"
}
```

---

## 影響範圍

| 檔案 | 變更內容 |
|------|----------|
| `scripts/generate-routes.mjs` | 從 Supabase 抓 ID 寫入 prerender-routes.txt |
| `functions/sitemap.xml.ts` | 補 company 個別頁 |
| `src/app/core/seo.service.ts` | 加入 canonical tag 設定 |
| `src/app/pages/group-page/group-page.component.ts` | OG 圖片、自動描述、豐富 JSON-LD |
| `src/app/pages/member-page/member-page.component.ts` | 自動描述、豐富 JSON-LD |
| `src/app/pages/company-page/company-page.component.ts` | 自動描述邏輯 |
| `src/app/pages/members-list/members-list.component.ts` | CollectionPage schema |

---

## 不在範圍內

- 頁面 UI 上顯示任何自動生成的文字
- 手動撰寫成員/團體簡介
- 付費 SEO 工具或廣告
