# Wanted Page — 缺少資料一覽

**Date:** 2026-04-03
**Status:** Approved

## Overview

新增一個公開頁面 `/wanted`，讓訪客一眼看出哪些成員、團體、公司的資料不完整，並引導他們提案補充。

## Goals

- 讓粉絲知道哪些條目需要補充資料
- 引導貢獻者直接點擊跳到提案頁面
- 不需要登入即可瀏覽

## Page Structure

```
/wanted

[頁面標題] 需要補充資料的條目
[統計摘要] 成員 X/Y 不完整・團體 X/Y 不完整・公司 X/Y 不完整
[圓圈矩陣] 所有不完整條目的頭像，邊框顏色代表完整度
[Tab 切換] 成員 | 團體 | 公司
[卡片列表] 依完整度從低到高排列
```

## Visual Design

### 圓圈矩陣概覽

頁面上方顯示所有不完整條目的頭像圓圈（大小統一），圓圈外框顏色代表完整度：

- 紅色邊框：完整度 < 50%
- 黃色邊框：完整度 50–80%
- 綠色或無邊框：資料完整（不出現在此頁面）

點擊圓圈跳到對應的條目頁面（`/member/:id`、`/group/:id`、`/company/:id`）。

### 卡片格式

每張卡片包含：
- 左：頭像（若無則顯示佔位符）
- 中：名稱、缺少的核心欄位 tag（例如「缺生日」「缺社群」）、完整度進度條 %
- 右：「補充資料」按鈕 → 連到該條目頁面並自動開啟提案 panel

## Completeness Logic

### 成員 (Member)

核心欄位（任一缺少即出現在頁面）：
- `photo_url`
- `birthdate`
- `name_roman`
- 社群帳號至少一個（`instagram` / `facebook` / `x`）

計入完整度 % 的所有欄位：
- 以上核心欄位 + `nickname`, `color`, `color_name`

### 團體 (Group)

核心欄位：
- `photo_url`
- `founded_at`
- `name_jp`
- 社群帳號至少一個（`instagram` / `facebook` / `x` / `youtube`）

計入完整度 % 的所有欄位：
- 以上核心欄位 + `disbanded_at`, `style`

### 公司 (Company)

核心欄位：
- `photo_url`
- `website`
- 社群帳號至少一個（`instagram` / `facebook` / `x` / `youtube`）

計入完整度 % 的所有欄位：
- 以上核心欄位 + `description`

### 完整度 % 計算

```
completeness = (有值的欄位數 / 總欄位數) * 100
```

社群帳號「至少一個」的判斷：只要有任一個社群欄位有值，即算此項通過。

## Sorting

預設依完整度從低到高排列（最需要補資料的排最前面）。

## Data Fetching

前端直接從 Supabase 查詢全量 members、groups、companies，在前端計算完整度。不需要新增後端 function 或 database view。

## Component Structure

```
WantedPageComponent          ← 新頁面 /wanted
  WantedSummaryComponent     ← 頂部統計摘要（三個數字）
  WantedGridComponent        ← 圓圈矩陣概覽（頭像 + 彩色邊框）
  WantedListComponent        ← Tab 切換 + 卡片列表
    WantedCardComponent      ← 單一條目卡片
```

## Deep Link — 自動開啟提案 Panel

卡片上的「補充資料」按鈕連到對應條目頁面，並帶上 query param：

- `/member/:id?propose=true`
- `/group/:id?propose=true`
- `/company/:id?propose=true`

成員、團體、公司頁面各自在 `ngOnInit` 偵測 `propose=true`，若存在則自動開啟 proposal panel。

點擊名字或頭像則正常導向條目頁面，不帶 query param。

## Routing

在 `app.routes.ts` 新增：
```ts
{
  path: 'wanted',
  loadComponent: () => import('./pages/wanted/wanted.component').then(m => m.WantedComponent)
}
```

## Navigation

在主選單或 guide 頁面加入 `/wanted` 連結，讓訪客能找到這個頁面。

## Out of Scope

- 篩選器（依欄位篩選）— 可未來再加
- Admin 統計儀表板 — 不需要，Admin 可直接查後台
