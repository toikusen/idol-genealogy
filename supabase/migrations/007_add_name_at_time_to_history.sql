-- Migration 007: 為 history 表新增 name_at_time 欄位
-- 用途：記錄成員在該段活動期間使用的名義（改名前的名字）
-- 說明：空白表示使用 members.name 現用名；有值則優先顯示此欄位

ALTER TABLE history ADD COLUMN IF NOT EXISTS name_at_time text;
