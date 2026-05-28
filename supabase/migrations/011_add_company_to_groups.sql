-- Migration 011: 新增 company 欄位到 groups，從 notes 搬移資料

-- 1. 新增欄位
ALTER TABLE groups ADD COLUMN IF NOT EXISTS company text;

-- 2. 從 notes 萃取「所屬：XXX」到 company
UPDATE groups
SET company = trim(substring(notes from '所屬：([^\n|]+)'))
WHERE notes LIKE '%所屬：%';
