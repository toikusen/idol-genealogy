# 偶像成員經歷族譜網頁 — 設計文件

**日期：** 2026-03-11
**狀態：** 已審核通過（v2）

---

## 專案概述

一個以 J-pop 偶像（48 系、坂道系等）為對象的成員經歷族譜網頁。使用者可以透過「成員」或「組合」兩種入口，視覺化追蹤成員在不同組合之間的流動歷程。資料由多人協作維護，採用類似 wiki 的開放編輯機制。

---

## 核心功能

### 雙入口設計
1. **成員模式** — 輸入成員姓名，展示其完整的跨組合經歷時間線
2. **組合模式** — 選擇組合，展示該組合的所有成員及其狀態樹狀圖

### 節點資訊
每個成員經歷節點顯示：
- 成員照片（頭像，使用外部圖片 URL）
- 加入／離開日期（時間區間）
- 備註說明（自由文字）

### 多人協作管理
- 任何人皆可瀏覽族譜（無需登入）
- 使用 Google 帳號登入後可新增／編輯資料
- 管理介面支援管理成員、組合、Team、歷史記錄的 CRUD 操作

---

## 技術架構

### 前端
- **框架：** Angular（standalone components + Angular Router）
- **樣式：** Tailwind CSS
- **族譜視覺化：** D3.js 或純 CSS/SVG
- **部署：** GitHub Pages 或 Netlify（靜態）
- **環境設定：** Angular environment files（`src/environments/environment.ts`）存放 Supabase URL 與 anon key；anon key 搭配 RLS 可安全公開，無需加密

### 後端
- **平台：** Supabase（免費 BaaS）
- **資料庫：** PostgreSQL
- **認證：** Supabase Auth（Google OAuth）
- **安全：** Row Level Security
  - 讀取：所有人可讀所有記錄（`is_approved` 目前不作為過濾條件，預留供未來啟用）
  - 寫入：需登入（`auth.uid() IS NOT NULL`）

---

## 資料模型

```sql
-- 成員
members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,           -- 中文 / 英文名
  name_jp     text,                    -- 日文名（ひらがな 或 漢字）
  photo_url   text,                    -- 外部圖片連結（任意 URL，可為空）
  birthdate   date,
  notes       text,
  updated_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
)

-- 組合
groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  name_jp       text,
  color         text,                  -- 組合專屬色（hex，例如 #e879a0）
  founded_at    date,
  disbanded_at  date,                  -- null = 仍活躍
  updated_at    timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
)

-- Team（組合下的分隊，可選層級）
teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid REFERENCES groups(id) ON DELETE RESTRICT,
  name        text NOT NULL,           -- 例如 "Team A"、"Team K"
  color       text,                    -- 可覆蓋 group 的顏色
  created_at  timestamptz DEFAULT now()
)

-- 成員經歷（核心關聯表）
history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid REFERENCES members(id) ON DELETE RESTRICT,
  group_id    uuid REFERENCES groups(id) ON DELETE RESTRICT,
  team_id     uuid REFERENCES teams(id) ON DELETE SET NULL,  -- 可選
  role        text,                    -- 自由文字標籤：研究生、正式成員、代理隊長、center 等
  status      text CHECK (status IN ('active','graduated','transferred','concurrent')),
  -- status 語意：
  --   active       = 正常在籍
  --   concurrent   = 兼任（同時間隸屬另一組合，觸發時間線分叉）
  --   transferred  = 移籍至另一組合（此記錄為離開）
  --   graduated    = 畢業（正式離開偶像活動）
  -- role 為描述性文字，status 為驅動視覺邏輯的機器可讀欄位
  -- 時間線分叉條件：同一 member_id 存在兩筆 status='concurrent' 且日期區間重疊的記錄
  joined_at   date NOT NULL,
  left_at     date,                    -- null = 仍在籍
  notes       text,
  is_approved boolean DEFAULT true,   -- 預留審核用；目前 RLS 讀取不過濾此欄位
  updated_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
)
```

### 外鍵刪除行為說明
- **`ON DELETE RESTRICT`**（members、groups、teams 被 history 引用）：若該成員 / 組合 / team 仍有歷史記錄，禁止刪除；需先刪除相關 history 記錄
- **`ON DELETE SET NULL`**（team_id）：若 team 被刪除，history 記錄保留但 `team_id` 設為 null

### `updated_at` 維護
透過 PostgreSQL trigger 或 Supabase `moddatetime` extension 自動更新 `updated_at`。

---

## 頁面結構

```
Angular App
├── /                    首頁（搜尋入口）
├── /member/:id          成員模式（垂直時間線）
├── /group/:id           組合模式（樹狀圖）
├── /admin               管理儀表板（需登入，CanActivate guard）
│   ├── /admin/members   管理成員
│   ├── /admin/groups    管理組合與 Team
│   └── /admin/history   管理成員經歷記錄
└── /login               登入頁（Google OAuth）
```

### Angular Route Guard
- `/admin` 及所有子路由使用同一個 `AuthGuard`（`CanActivate`）
- 未登入直接訪問 `/admin/**` → 自動 redirect 至 `/login?returnUrl=...`
- 登入後 redirect 回原本目標路由

### Angular 服務層

```
Services
├── SupabaseService      初始化 Supabase 客戶端、管理 Auth session 狀態
├── MemberService        成員 CRUD、依 ID 查詢完整經歷（含組合資訊）
├── GroupService         組合 / Team CRUD、依 ID 查詢所有成員及歷史
└── HistoryService       成員經歷記錄 CRUD
```

---

## 頁面設計細節

### 首頁（/）
- 搜尋框（同時搜尋 `members.name` 與 `members.name_jp`，使用 `ilike '%keyword%'`，同時搜尋組合名稱）
- 搜尋結果：列出符合的成員與組合，分組顯示
- 最近更新成員列表：取 `members` 依 `updated_at DESC` 排序，顯示最新 10 筆，無分頁

### 成員模式（/member/:id）
- 頂部：大頭照 + 姓名（日文）+ 出生日期
- 主體：垂直時間線，由舊到新（`joined_at ASC`）
  - 每個節點 = 一筆 `history` 記錄
  - 節點左側色塊 = 對應組合的 `color`
  - 節點內容：組合名稱、Team 名稱（如有）、時間區間、role、notes
  - **分叉顯示條件**：同一成員有兩筆 `status = 'concurrent'` 且日期重疊 → 時間線在重疊區間分叉為兩條並行線段，重疊結束後合回單線
- **空狀態**：若成員存在但無 history 記錄 → 顯示「此成員尚無歷史記錄，歡迎登入補充資料」

### 組合模式（/group/:id）
- 頂部：組合名稱 + 成立日期 / 解散狀態
- 主體：樹狀圖
  - 根節點 = 組合
  - 中層節點 = Team（若有 teams 資料；若無則跳過此層，直接顯示成員）
  - 葉節點 = 成員頭像卡片（含在職期間）
  - 點擊成員卡片 → 展開小面板（照片、role、時間區間、notes）→ 可跳轉至成員模式
- **空狀態**：若組合存在但無成員記錄 → 顯示「此組合尚無成員資料，歡迎登入補充」

### 管理介面（/admin）
- 需通過 `AuthGuard` 才可進入
- 三個子頁面，各自有資料表格 + 新增／編輯表單（Modal）
- **成員表單欄位**：name（必填）、name_jp、photo_url（任意 URL，可空白）、birthdate、notes
- **組合表單欄位**：name（必填）、name_jp、color（色碼選擇器）、founded_at、disbanded_at
- **歷史記錄表單欄位**：member_id（搜尋選擇）、group_id（搜尋選擇）、team_id（可選）、role（文字）、status（下拉選單）、joined_at（必填）、left_at、notes

---

## 視覺風格

- **主題：** 粉嫩柔和（Soft Pastel）
- **背景：** `#fdf4f9` → `#f0f4ff` 柔和漸層
- **組合顏色：** 每個組合分配馬卡龍色系（粉紅、薰衣草、薄荷、水藍等）
- **字型：**
  - 標題：Nunito 或 Noto Sans JP（圓體）
  - 內文：Noto Sans JP 細體
- **連線樣式：**
  - 正常隸屬：實線圓角
  - 兼任（concurrent）關係：虛線
- **卡片：** 白底、圓角、淡陰影，懸停時微放大
- **目標瀏覽器：** 最新版 Chrome / Safari / Firefox，最小桌面寬度 1280px

---

## 範圍外（不在本次設計內）

- 多語言切換（i18n）
- 成員編輯歷史版本控制（`is_approved` 審核機制預留但未啟用）
- 圖片上傳（photo_url 使用外部連結）
- 行動裝置原生 App
- 伺服器端渲染（SSR）

---

## 成功標準

1. 可以搜尋一個 AKB48 成員，清楚看到她從研究生到移籍的完整時間線，含正確的兼任分叉
2. 可以瀏覽 AKB48 的組合頁，看到所有 Team 及其成員（有 Team 資料時顯示中層節點）
3. 登入後可以新增一筆成員經歷，資料儲存至 Supabase 後立即在族譜上反映
4. 頁面在 1280px 以上的桌面瀏覽器（Chrome / Safari / Firefox 最新版）正常顯示，視覺風格一致
5. 未登入使用者訪問 `/admin` 時，自動被導向至 `/login`
