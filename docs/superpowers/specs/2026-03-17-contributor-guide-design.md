# Contributor Guide Design Spec

**Date:** 2026-03-17
**Feature:** 編輯者教學手冊（Contributor Guide）

---

## Goal

為有意願補充偶像資料、但不熟悉網站操作的使用者，提供清楚的引導。受眾是「知道自己想貢獻什麼資料，但不確定怎麼操作」的人，不是完全零基礎的新手。

---

## Architecture Overview

兩個層次的說明系統：

1. **`/guide` 頁面** — 獨立的完整手冊，從首頁 footer 連結進入，捲動式單頁設計
2. **提案面板 inline hints** — 在 `ProposalPanelComponent` 的欄位 placeholder 裡加上格式範例，不需要離開面板

---

## Part 1: `/guide` Page

### Route

```
/guide  →  GuideComponent (lazy-loaded standalone)
```

從 `app.routes.ts` 加在 wildcard 前，從首頁 footer 的「貢獻者手冊」連結進入。

### 頁面結構

單頁捲動，三個章節，共用與其他頁面一致的設計語言（Shippori Mincho, Cormorant Garamond, 粉色系主題）。

#### Header

- 小標：`CONTRIBUTOR GUIDE · 貢獻者手冊`
- 主標：「如何補充偶像資料」
- 副標：一行說明文字

#### 章節 01 — 提案流程

**前置條件 callout（重要）**

紫色底的 callout box，說明：

> 如果你想補充某位偶像在某個團體的在籍歷程，必須先確認：
> ① 該成員的頁面已存在
> ② 該組合的頁面已存在
> → 兩者都有後，才能在組合頁面「提案新增歷程」

**4 個步驟（逐步引導）**

1. 找到想補充的頁面 — 搜尋或瀏覽，找不到先提案新增
2. 點擊「✏️ 提案修改」或「＋ 提案新增」— 說明按鈕位置
3. 填寫資料並送出 — 強調「只填確定的欄位，不確定留空」
4. 等待管理員審核 — 通過後自動更新

#### 章節 02 — 資料來源建議

兩欄對照表：

| ✅ 建議來源 | ⚠️ 請避免 |
|---|---|
| 官方 Instagram / X | 粉絲二手轉述 |
| 活動主辦方公告 | 未確認的道聽途說 |
| 官方 YouTube 頻道 | 個人推測或猜測 |
| 實體 CD / DVD 資訊 | 已刪除的貼文 |

#### 章節 03 — 登入的好處

兩欄對比：

| 未登入提案 | Google 登入後 |
|---|---|
| 可以提案 | 可以提案 |
| 顯示自填暱稱 | 顯示 Google 帳號名稱 |
| ~~不計入貢獻者排名~~ | ✦ 貢獻計入排行榜 |

下方加 Google 登入 CTA 按鈕，連結到 `/login`。

#### Footer

返回首頁連結。

---

## Part 2: Proposal Panel Inline Hints

在 `ProposalPanelComponent` 的 template（`proposal-panel.component.ts` 內嵌 template）中，為常見欄位加上 placeholder 格式提示。目標是讓使用者在填表當下就知道格式，不需要查手冊。

### 欄位 Placeholder 規則

| 資料表 | 欄位 | 現有 placeholder | 新增提示 |
|---|---|---|---|
| members | name | — | 例：あいみ（日文名）|
| members | name_roman | — | 例：Aimi（羅馬字）|
| members | birthdate | — | 例：03-15（MM-DD）|
| groups | name | — | 例：KissBee |
| groups | founded_at | — | 例：2019-04（YYYY-MM）|
| history | joined_at | — | 例：2020-03（加入年月）|
| history | left_at | — | 例：2022-09（離開年月，仍在籍留空）|

---

## Part 3: Footer Link

在以下頁面的 footer 加上「貢獻者手冊」連結，指向 `/guide`：

- `home.component.html`
- `member-page.component.html`
- `group-page.component.html`
- `company-page.component.html`

---

## Tech Stack

- Angular 19 standalone component（`GuideComponent`）
- 無需 API 呼叫，純靜態頁面
- 樣式沿用 inline style + Tailwind，與現有頁面一致
- 無新的 Service 或 model

---

## Out of Scope

- 多語言版本
- 互動式 checklist
- 影片教學
- 欄位說明的 tooltip hover（保持簡單，改用 placeholder）
