import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { diff, formatMessage, refIds } from './format.ts';

const M = 'm-1', G = 'g-1';
const names = { [M]: '花子', [G]: 'GroupA' };

Deno.test('pending member proposal lists changed fields and the new photo', () => {
  const msg = formatMessage({
    table: 'proposals',
    record: {
      status: 'pending', table_name: 'members', operation: 'UPDATE', record_id: M, submitter_name: 'fan', submitter_note: '官網更新',
      original_data: { nickname: null, photo_url: 'https://x/old.jpg' },
      proposed_data: { nickname: 'はな', photo_url: 'https://x/new.jpg' },
    },
  }, { id: M, name: '花子' }, names);
  assertEquals(msg?.text, [
    '📝 新提案待審核', '成員修改：花子', '提交者：fan', '說明：官網更新', '',
    '• 暱稱：（空） → はな', '• 頭像圖片：https://x/old.jpg → https://x/new.jpg', '',
    'https://idolmaps.com/admin/proposals',
  ].join('\n'));
  assertEquals(msg?.photos, [{ label: '頭像圖片', url: 'https://x/new.jpg' }]);
});

Deno.test('history audit names member and group and translates status', () => {
  const row = { id: 'h', member_id: M, group_id: G, status: 'active', left_at: null, updated_at: 'a' };
  const msg = formatMessage({
    table: 'audit_log',
    record: { table_name: 'history', operation: 'UPDATE', user_email: 'a@b.c', old_data: row, new_data: { ...row, status: 'graduated', left_at: '2027-01-17', updated_at: 'b' } },
  }, null, names);
  assertEquals(msg?.text.split('\n').slice(1, 6), [
    '歷程修改：花子 @ 《GroupA》', '操作者：a@b.c', '', '• 狀態：正常在籍 → 畢業', '• 離開日期：（空） → 2027-01-17',
  ]);
});

Deno.test('touch-only updates and non-pending proposals are skipped', () => {
  const touch = { table_name: 'members', operation: 'UPDATE', old_data: { name: 'A', updated_at: '1' }, new_data: { name: 'A', updated_at: '2' } };
  assertEquals(formatMessage({ table: 'audit_log', record: touch }, null, {}), null);
  assertEquals(formatMessage({ table: 'proposals', record: { status: 'approved', table_name: 'members', operation: 'INSERT' } }, null, {}), null);
  assertEquals(formatMessage({ table: 'members', record: {} }, null, {}), null);
});

Deno.test('delete keeps the removed values and sends no photo', () => {
  const msg = formatMessage({
    table: 'audit_log',
    record: { table_name: 'groups', operation: 'DELETE', old_data: { id: G, name: 'GroupA', photo_url: 'https://x/g.jpg' }, new_data: null },
  }, null, {});
  assertEquals(msg?.text.includes('• 頭像圖片：https://x/g.jpg'), true);
  assertEquals(msg?.photos, []);
});

Deno.test('song subject shows its owner; ids collected per table', () => {
  const msg = formatMessage({
    table: 'audit_log', record: { table_name: 'group_songs', operation: 'INSERT', new_data: { title: 'Song', group_id: G, sort_order: 3 } },
  }, null, names);
  assertEquals(msg?.text.split('\n')[1], '團體歌曲新增：Song（《GroupA》）');
  assertEquals(msg?.text.includes('sort_order'), false);
  assertEquals(refIds([{ member_id: M, group_id: G }, { group_id: G, company_id: null }]), { members: [M], groups: [G] });
  assertEquals(diff({ op: 'UPDATE', before: { a: 1 }, after: { a: 1, b: '' } }), []);
});
