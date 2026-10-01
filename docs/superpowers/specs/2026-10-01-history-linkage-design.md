# 成員／團體與歷程的連動：補歷程入口 + 新增成員附帶經歷

日期：2026-10-01

## 問題

使用者新增成員或團體後，常常沒有補成員歷程，資料沒有連起來。

原本的想法是「新增完跳 pop up 提醒補歷程」，但**新增成員／團體只會建立一筆
pending 提案**，管理員通過前該 entity 不存在、沒有 id
（`ProposalService.approve()` 在通過時才 insert 並取得 id）。送出當下使用者
無法替它新增歷程，pop up 只能叫人「之後再回來」，效果差。

因此拆成兩件事，分兩次上線：

| | 處理什麼 | 改動範圍 |
|---|---|---|
| **B** | 已存在、沒有歷程的成員／團體（含所有新增團體） | 兩個頁面的空狀態 |
| **A** | 新增成員的源頭：填資料當下順手附上第一筆經歷 | 提案格式、`approve()`、審核頁 |

先上 B（小、不碰審核流程），再上 A。

## B：沒有歷程時的補資料卡片

不用 pop up：pop up 會打斷所有訪客；卡片只出現在相關位置。不新增元件。

### 成員頁

- `MemberTimelineComponent`（`src/app/shared/member-timeline/member-timeline.component.ts`）
  的 `segments.length === 0` 空狀態：
  - 文案改為「還沒有這位成員的團體經歷」＋「知道的話幫忙補上」。
  - 新增按鈕「＋ 新增經歷」，觸發新 output `addHistory`。
  - 移除「歡迎登入後補充資料」（提案不需要登入，這句是錯的）。
- `member-page.component.html`：`<app-member-timeline ... (addHistory)="showOverseasPanel = true">`，
  沿用現有新增歷程面板。

### 團體頁

- `group-page.component.html` 的 `@if (ganttRows.length > 0)` 加 `@else`：
  同樣樣式的卡片，文案「還沒有這個團體的成員經歷」，按鈕
  `(click)="showNewHistoryPanel = true"`。
- 頂部既有的「＋ 提案新增歷程」按鈕保留。

### 測試

- 新建 `member-timeline.component.spec.ts`：`histories = []` 時渲染按鈕，點擊 emit
  `addHistory`；有歷程時不渲染該按鈕。
- 團體頁只是模板分支，不另寫測試；手動確認一個無成員團體的畫面。

## A：新增成員時附上第一筆經歷

### 表單

- 只在 `tableName === 'members' && operation === 'INSERT'` 時，於
  `ProposalPanelComponent` 表單底部加入可收合的選填區塊「目前所屬團體（選填）」。
- 欄位：台灣團體／海外團體·solo 切換、`group_id`（下拉）或
  `external_group_name` + `external_country`、`status`、`joined_at`、`left_at`。
  不含 `name_at_time`、`role`、`notes`（YAGNI）。
- 規則：區塊內**任何一個欄位有值**就視為要附經歷，此時套用與歷程表單相同的必填：
  台灣團體 → `group_id`、`status`、`joined_at`；海外／solo → `external_group_name`、
  `status`、`joined_at`（即 `effectiveRequiredFields` 的規則）。全部留空 → 不附。
- 需要團體清單：home 頁的成員新增面板加 `[groups]="allGroups"`（`home.component.ts` 已載入）。

### 資料格式

- 附帶經歷存於 `proposed_data._history`（物件，欄位同 history 表，不含 `member_id`）。
- 底線前綴表示「不是 members 欄位」，`approve()` 與審核頁都必須在寫入
  members 表前把它拿掉。
- 經歷沒有獨立的提案紀錄，貢獻歸屬在該成員新增提案。

### 審核（`ProposalService.approve()`）

成員 INSERT 提案且帶 `_history` 時：

1. 從 `dataToApply` 拆出 `_history`，其餘 insert 進 `members`，取得新 id。
2. insert `history`：`{ ..._history, member_id: newId }`。
3. 成員成功、歷程失敗：**不回滾成員**。提案照常標記 approved，並把錯誤拋給
   審核頁顯示「成員已建立，但附帶經歷建立失敗：<原因>，請到成員頁手動補上」。
   理由：成員資料本身有效，回滾會讓管理員重審整筆。
4. 兩張表的快取都要 invalidate（`invalidateTableCache('members')`、`'history'`）。

### 審核頁（`admin-proposal-review`）

- 欄位迴圈跳過 `_history`，避免物件被渲染成 `[object Object]` 的輸入框。
- 另外顯示「附帶經歷」區塊：團體名稱（用 group_id 查名稱或 external_group_name）、
  狀態、加入／離開日期，可編輯；編輯結果寫回 `editedData._history`。
- 管理員可以「移除附帶經歷」（刪除 `editedData._history`），只建立成員。

### 測試

- `proposal.service.spec.ts`（既有檔，mock db）：
  - 無 `_history` → 只 insert members，行為與現在相同。
  - 有 `_history` → members insert 不含 `_history`；history insert 帶新 `member_id`。
  - history insert 失敗 → members 已 insert、提案仍標記 approved、拋出指定錯誤訊息。
- `proposal-panel.component.spec.ts`：
  - 附帶區塊全空 → `proposed` 沒有 `_history`。
  - 填了一部分 → 缺的必填欄位報錯。
  - 海外／solo → 要求 `external_group_name` 而非 `group_id`。

## 不做

- 新增團體時附成員：成員多半尚未存在，會變成一次多筆相依提案，太複雜。
  新增團體的情境由 B 的卡片處理。
- 提案通過後通知提交者：目前沒有通知管道，只對登入者有效。
- 送出後的 pop up：見「問題」一節。
