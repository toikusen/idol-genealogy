-- ============================================================
-- 攝錄規範初始資料
-- 整理自：攝影規範社群討論彙整 · 2026.06
-- 大前提：是否開放攝錄影，均以活動主辦方規定為主。
--         以下各團規範皆以「主辦方開放攝錄影」為前提。
-- ============================================================
--
-- photo_status / video_status enum:
--   'allowed'     = 可拍／可錄（無需審核）
--   'not_allowed' = 不可拍／不可錄
--   'conditional' = 條件式（需審核 / 需特定條件 / 現場宣布）
--
-- 執行方式：在 Supabase SQL Editor 貼上執行
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

-- 魔藥商會（DB 完整名稱含引號與特殊字元）
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

-- 存征（DB 完整名稱：存在証明 NO FACE NO REaLiTY）
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '需審核後發布',
  video_status       = 'allowed',
  video_notes        = '需標記 SNS',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%存在証明%' OR name ILIKE '%存征%';

-- i<3
UPDATE groups SET
  photo_status       = 'allowed',
  photo_notes        = '主辦公告開放後可自由拍，無需事前審核；歡迎標註粉專及成員帳號',
  video_status       = 'allowed',
  video_notes        = '主辦公告開放後可自由錄，無需事前審核；歡迎標註粉專及成員帳號',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%i<3%';

-- SSR 旗下四個團體 ──────────────────────────────────────────

-- 木苺FRUCTOSE
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  video_status       = 'conditional',
  video_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%木苺%' OR name ILIKE '%FRUCTOSE%';

-- 時空Astria
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  video_status       = 'conditional',
  video_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%時空%Astria%';

-- 幻波SYNC
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  video_status       = 'conditional',
  video_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%幻波%' OR name ILIKE '%SYNC%';

-- 初恋Eternal
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  video_status       = 'conditional',
  video_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%初恋%' OR name ILIKE '%Eternal%';

-- SSr 研修生
UPDATE groups SET
  photo_status       = 'conditional',
  photo_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  video_status       = 'conditional',
  video_notes        = '一般不開放；視場合開放時不審但需標注；生誕攝影票需審',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%SSr%研修%' OR name ILIKE '%SSR%研修%';


-- ─── MEMBERS ─────────────────────────────────────────────────────────────────

-- 花葉（成員 花葉 Hanaba）
UPDATE members SET
  photo_status       = 'allowed',
  photo_notes        = '需標記',
  video_status       = 'allowed',
  video_notes        = '需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%花葉%';

-- 天乃繪空（DB 名稱：天乃絵空）
UPDATE members SET
  photo_status       = 'conditional',
  photo_notes        = '需審核，需標記',
  video_status       = 'allowed',
  video_notes        = '需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%天乃%';

-- 布琳 Purin（DB 名稱：布琳プリンouo）
UPDATE members SET
  photo_status       = 'conditional',
  photo_notes        = '公開需審核並標記官方帳號',
  video_status       = 'allowed',
  video_notes        = '公開需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%布琳%' OR name ILIKE '%プリン%';

-- 那比 NABI（DB 名稱：那比NABI 或 那比 Nabi）
UPDATE members SET
  photo_status       = 'allowed',
  photo_notes        = '個人立場開放；若限動發布請標注',
  video_status       = 'allowed',
  video_notes        = '個人立場開放；若限動發布請標注',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%那比%';

-- Honoh Wu 火火（DB 名稱：Ruka Banana）
UPDATE members SET
  photo_status       = 'allowed',
  photo_notes        = '主辦開放後可拍，需標記',
  video_status       = 'allowed',
  video_notes        = '主辦開放後可錄，需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%Ruka%Banana%';

-- OMOCHI おもち（DB 名稱：OMOCHIおもち）
UPDATE members SET
  photo_status       = 'conditional',
  photo_notes        = '一般不可拍；開放時會提前公佈，需審核',
  video_status       = 'allowed',
  video_notes        = '免審，需標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%OMOCHI%' OR name ILIKE '%おもち%';

-- 莉央（DB 名稱：稲妻莉央）
UPDATE members SET
  photo_status       = 'conditional',
  photo_notes        = '需審核',
  video_status       = 'allowed',
  video_notes        = '免審，希望標記',
  photography_source = '攝影規範社群討論彙整 · 2026.06'
WHERE name ILIKE '%莉央%';

COMMIT;

-- ============================================================
-- 執行後確認：
-- SELECT name, photo_status, photo_notes, video_status, video_notes
--   FROM groups WHERE photo_status IS NOT NULL ORDER BY name;
--
-- SELECT name, photo_status, photo_notes, video_status, video_notes
--   FROM members WHERE photo_status IS NOT NULL ORDER BY name;
-- ============================================================
