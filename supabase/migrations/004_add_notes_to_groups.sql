-- Migration 004: 為 groups 表新增 notes 欄位
-- 理由：用於存放廠牌/事務所資訊（所屬）及其他備註，與 members.notes 對齊

ALTER TABLE groups ADD COLUMN IF NOT EXISTS notes text;
