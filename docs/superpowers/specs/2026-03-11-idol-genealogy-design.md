# 偶像成員經歷族譜網頁 — 設計文件

**日期：** 2026-03-11
**狀態：** 已審核通過

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
- 成員照片（頭像）
- 加入／離開日期（時間區間）
- 備註說明（自由文字）

### 多人協作管理
- 任何人皆可瀏覽族譜（無需登入）
- 使用 Google 帳號登入後可新增／編輯資料
- 管理介面支援管理成員、組合、歷史記錄的 CRUD 操作

---

## 技術架構

### 前端
- **框架：** Angular（standalone components + Angular Router）
- **樣式：** Tailwind CSS
- **族譜視覺化：** D3.js 或純 CSS/SVG
- **部署：** GitHub Pages 或 Netlify（靜態）

### 後端
- **平台：** Supabase（免費 BaaS）
- **資料庫：** PostgreSQL
- **認證：** Supabase Auth（Google OAuth）
- **安全：** Row Level Security — 所有人可讀，登入者可寫

---

## 資料模型

```sql
-- 成員
members (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,           -- 中文 / 英文名
  name_jp     text,                    -- 日文名
  photo_url   text,
  birthdate   date,
  notes       text,
  created_at  timestamptz DEFAULT now()
)

-- 組合
groups (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  name_jp       text,
  color         text,                  -- 組合專屬色（hex）
  founded_at    date,
  disbanded_at  date,
  created_at    timestamptz DEFAULT now()
)

-- 成員經歷（核心關聯表）
history (
  id          uuid PRIMARY KEY,
  member_id   uuid REFERENCES members(id),
  group_id    uuid REFERENCES groups(id),
  role        text,                    -- 正式成員、研究生、兼任、移籍等
  joined_at   date NOT NULL,
  left_at     date,                    -- null = 仍在籍
  notes       text,
  status      text CHECK (status IN ('active','graduated','transferred','concurrent')),
  is_approved boolean DEFAULT true,   -- 未來可改為 false 啟用審核機制
  created_at  timestamptz DEFAULT now()
)
```

---

## 頁面結構

```
Angular App
├── /                    首頁（搜尋入口）
├── /member/:id          成員模式（垂直時間線）
├── /group/:id           組合模式（樹狀圖）
├── /admin               管理儀表板（需登入）
│   ├── /admin/members   管理成員
│   ├── /admin/groups    管理組合
│   └── /admin/history   管理成員經歷記錄
└── /login               登入頁（Google OAuth）
```

### Angular 服務層

```
Services
├── SupabaseService      初始化客戶端、Auth 狀態管理
├── MemberService        成員 CRUD、依 ID 查詢完整經歷
└── GroupService         組合 CRUD、依 ID 查詢所有成員
```

---

## 頁面設計細節

### 首頁（/）
- 搜尋框（姓名搜尋）
- 兩個入口按鈕：「找成員」/ 「找組合」
- 最近更新的成員列表（顯示最新 10 筆）

### 成員模式（/member/:id）
- 頂部：大頭照 + 姓名（日文）+ 出生日期
- 主體：垂直時間線，由舊到新排列
  - 每個節點 = 一段組合經歷
  - 節點左側色塊 = 組合專屬色
  - 節點內容：組合名稱、時間區間、角色、備註
  - 兼任期間：時間線分叉為兩條並行線段

### 組合模式（/group/:id）
- 頂部：組合名稱 + 成立日期 / 解散日期
- 主體：樹狀圖
  - 根節點 = 組合
  - 中層節點 = Team（如適用）
  - 葉節點 = 成員頭像卡片（含在職期間）
  - 點擊成員卡片 → 展開詳情 → 可跳轉至成員模式

### 管理介面（/admin）
- Google 登入防護（Supabase Auth + Angular Route Guard）
- 三個子頁面，各自有資料表格 + 新增／編輯表單（Modal）
- 表單欄位對應資料模型

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
  - 兼任關係：虛線
- **卡片：** 白底、圓角、淡陰影，懸停時微放大

---

## 範圍外（不在本次設計內）

- 多語言切換（i18n）
- 成員編輯歷史版本控制
- 圖片上傳（photo_url 使用外部圖片連結）
- 管理員審核流程（is_approved 欄位預留，預設 true）
- 行動裝置原生 App

---

## 成功標準

1. 可以搜尋一個 AKB48 成員，清楚看到她從研究生到移籍的完整時間線
2. 可以瀏覽 AKB48 的組合頁，看到所有 Team 及其成員
3. 登入後可以新增一筆成員經歷，立即在族譜上反映
4. 頁面在桌面瀏覽器上正常顯示，視覺風格一致
