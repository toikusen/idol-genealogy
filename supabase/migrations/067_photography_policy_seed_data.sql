-- ============================================================
-- 攝錄規範初始資料
-- 整理自：攝影規範社群討論彙整 · 2026.06
-- 大前提：是否開放攝錄影，均以活動主辦方規定為主。
--         以下各團規範皆以「主辦方開放攝錄影」為前提。
-- ============================================================
--
-- 使用說明：
--   photo_status / video_status enum:
--     'allowed'     = 可拍／可錄（無需審核）
--     'not_allowed' = 不可拍／不可錄
--     'conditional' = 條件式（需審核 / 需特定條件 / 現場宣布）
--   photography_source = 資訊來源，可依實際補充修改
--
-- 執行方式：在 Supabase SQL Editor 直接執行此檔案
-- ============================================================

BEGIN;

-- ─── GROUPS ──────────────────────────────────────────────────────────────────

-- 未完成プロローグ
UPDATE groups SET
  photo_status       = 'not_allowed',
  photo_notes        = NULL,
  video_status       = 'allowed',
  video_notes        = '需標記成員',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%未完成プロローグ%';

-- RukaBanana
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '需標記',
  video_status       = 'allowed',
  video_notes        = '需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%RukaBanana%';

-- Flora・Fiore
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '需標記',
  video_status       = 'allowed',
  video_notes        = '需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%Flora%Fiore%';

-- LuvRush
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '需標記',
  video_status       = 'allowed',
  video_notes        = '需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%LuvRush%';

-- 花葉（團體）
-- ⚠️ 若資料庫同時有 members.「花葉 Hanaba」和 groups.「花葉」，此條只更新 groups
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '需標記',
  video_status       = 'allowed',
  video_notes        = '需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%花葉%';

-- Planck Stars
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '需審核後發布',
  video_status       = 'allowed',
  video_notes        = '免審',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%Planck%';

-- おれ。
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '一般不開放；主催有攝影票，需購票並審核',
  video_status       = 'conditional',
  video_notes        = '現場宣布開放哪幾首，免審',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%おれ%';

-- 魔藥商會（DB 完整名稱含引號與特殊字元，ILIKE 比對前綴）
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '無需審核，需標記；拼盤場依主辦規定',
  video_status       = 'allowed',
  video_notes        = '無需審核，需標記；拼盤場依主辦規定',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%魔藥商會%';

-- Vezalia
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '需標記',
  video_status       = 'allowed',
  video_notes        = '需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%Vezalia%';

-- 曖昧寶石（DB 名稱：曖昧な寶石）
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '需審核後發布',
  video_status       = 'allowed',
  video_notes        = '免審，需標記 SNS',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%曖昧%';

-- 星瞳グレア（DB 名稱：星瞳⭐︎グレア）
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '需審核，需標記；有不開放情況會提前告知',
  video_status       = 'allowed',
  video_notes        = '免審，需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%星瞳%';

-- 鏡裂 Ecstasia
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '需審核，需標記',
  video_status       = 'conditional',
  video_notes        = '需審核，需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%鏡裂%' OR name ILIKE '%Ecstasia%';

-- 那比 NABI（seed 002 個人演出者，存於 groups 表）
-- ⚠️ members 表也可能有同名成員紀錄，請確認後再決定是否也更新 members
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '個人立場開放；若限動發布請標注',
  video_status       = 'allowed',
  video_notes        = '個人立場開放；若限動發布請標注',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%那比%' OR name ILIKE '%NABI%';

-- SSR（旗下）
-- ⚠️ 若 SSR 為廠牌/事務所而非獨立 group，請調整 WHERE 條件
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  video_status       = 'conditional',
  video_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%SSR%';

-- 存征（DB 完整名稱：存在証明 NO FACE NO REaLiTY）
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '需審核後發布',
  video_status       = 'allowed',
  video_notes        = '需標記 SNS',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%存在証明%' OR name ILIKE '%存征%';

-- i_three.idol
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '主辦公告開放後可自由拍，無需事前審核；歡迎標註粉專及成員帳號',
  video_status       = 'allowed',
  video_notes        = '主辦公告開放後可自由錄，無需事前審核；歡迎標註粉專及成員帳號',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%i_three%';

-- Honoh Wu（火火）
-- ⚠️ 不確定在 groups 或 members，先更新 groups；若無符合請改查 members
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '主辦開放後可拍，需標記',
  video_status       = 'allowed',
  video_notes        = '主辦開放後可錄，需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%Honoh%' OR name ILIKE '%火火%';


-- ─── MEMBERS ─────────────────────────────────────────────────────────────────

-- 天乃繪空（members 表，DB 名稱：天乃絵空）
UPDATE members SET
  photo_status       = 'conditional',
  photo_notes        = '需審核，需標記',
  video_status       = 'allowed',
  video_notes        = '需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%天乃%';

-- OMOCHI おもち（members 表，DB 名稱：OMOCHIおもち）
UPDATE members SET
  photo_status       = 'conditional',
  photo_notes        = '一般不可拍；開放時會提前公佈，需審核',
  video_status       = 'allowed',
  video_notes        = '免審，需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%OMOCHI%' OR name ILIKE '%おもち%';

-- 莉央（members 表，DB 名稱：稲妻莉央）
UPDATE members SET
  photo_status       = 'conditional',
  photo_notes        = '需審核',
  video_status       = 'allowed',
  video_notes        = '免審，希望標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%莉央%';

-- 布琳 Purin（個人活動）
-- ⚠️ 不確定在 groups 或 members，先嘗試 members；若無符合請改查 groups
UPDATE members SET
  photo_status       = 'conditional',
  photo_notes        = '公開需審核並標記官方帳號',
  video_status       = 'allowed',
  video_notes        = '公開需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%布琳%' OR name ILIKE '%Purin%';

COMMIT;

-- ============================================================
-- 執行後確認（可選）：
-- SELECT name, photo_status, photo_notes, video_status, video_notes
--   FROM groups
--  WHERE photo_status IS NOT NULL
--  ORDER BY name;
--
-- SELECT name, photo_status, photo_notes, video_status, video_notes
--   FROM members
--  WHERE photo_status IS NOT NULL
--  ORDER BY name;
-- ============================================================
