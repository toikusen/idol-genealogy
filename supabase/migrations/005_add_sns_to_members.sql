-- Migration 005: 為 members 表新增 sns 欄位
-- 用途：存放成員 SNS 連結（Twitter/X、Instagram、YouTube 等）

ALTER TABLE members ADD COLUMN IF NOT EXISTS sns text;
