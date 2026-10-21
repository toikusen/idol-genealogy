import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formatMessage } from './format.ts';

Deno.test('pending proposal names the record and submitter', () => {
  const text = formatMessage({
    table: 'proposals',
    record: { status: 'pending', table_name: 'members', operation: 'UPDATE', proposed_data: { name: 'A' }, submitter_name: 'fan' },
  });
  assertEquals(text, '📝 新提案待審核\n成員修改：A\n提交者：fan\nhttps://idolmaps.com/admin/proposals');
});

Deno.test('admin-approved proposals are not announced again', () => {
  assertEquals(formatMessage({ table: 'proposals', record: { status: 'approved', table_name: 'members', operation: 'INSERT' } }), null);
});

Deno.test('audit delete falls back to old_data name', () => {
  const text = formatMessage({
    table: 'audit_log',
    record: { table_name: 'groups', operation: 'DELETE', old_data: { name: 'G' }, new_data: null, user_email: 'a@b.c' },
  });
  assertEquals(text, '🛠 後台變更\n團體刪除：G\n操作者：a@b.c\nhttps://idolmaps.com/admin/audit-log');
});

Deno.test('unknown table or missing record is skipped', () => {
  assertEquals(formatMessage({ table: 'members', record: {} }), null);
  assertEquals(formatMessage({ table: 'audit_log' }), null);
});
