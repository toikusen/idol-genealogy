-- Migration 006: 將 sns 欄位拆分為三個平台欄位
-- instagram、facebook、x 各自獨立，非必填

ALTER TABLE members
  DROP COLUMN IF EXISTS sns,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS facebook  text,
  ADD COLUMN IF NOT EXISTS x         text;
