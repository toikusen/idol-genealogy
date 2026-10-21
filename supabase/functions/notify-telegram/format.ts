const SITE = 'https://idolmaps.com';

const TABLES: Record<string, string> = {
  members: '成員', groups: '團體', companies: '公司', history: '歷程', venues: '場館',
  songs: '歌曲', member_songs: '成員歌曲', group_songs: '團體歌曲',
};
const OPS: Record<string, string> = { INSERT: '新增', UPDATE: '修改', DELETE: '刪除' };

type Data = { name?: unknown } | null;
interface Row {
  table_name?: string; operation?: string; status?: string;
  proposed_data?: Data; original_data?: Data; submitter_name?: string | null;
  new_data?: Data; old_data?: Data; user_email?: string | null;
}
export interface WebhookPayload { table?: string; record?: Row }

const nameOf = (...rows: (Data | undefined)[]) =>
  rows.map((r) => r?.name).find((n): n is string => typeof n === 'string' && n !== '');

const what = (r: Row, name: string | undefined) =>
  `${TABLES[r.table_name ?? ''] ?? r.table_name}${OPS[r.operation ?? ''] ?? r.operation}${name ? `：${name}` : ''}`;

/** Telegram message text for a proposals / audit_log insert, or null when it should not be sent. */
export function formatMessage(p: WebhookPayload): string | null {
  const r = p.record;
  if (!r) return null;
  if (p.table === 'proposals') {
    if (r.status !== 'pending') return null;
    return [
      '📝 新提案待審核',
      what(r, nameOf(r.proposed_data, r.original_data)),
      `提交者：${r.submitter_name || '匿名'}`,
      `${SITE}/admin/proposals`,
    ].join('\n');
  }
  if (p.table === 'audit_log') {
    return [
      '🛠 後台變更',
      what(r, nameOf(r.new_data, r.old_data)),
      `操作者：${r.user_email || '系統'}`,
      `${SITE}/admin/audit-log`,
    ].join('\n');
  }
  return null;
}
