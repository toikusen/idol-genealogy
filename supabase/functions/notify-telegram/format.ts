import { FIELD_LABELS } from '../../../src/app/core/proposal-fields.config.ts';

const SITE = 'https://idolmaps.com';
const MAX_TEXT = 4000; // Telegram caps a message at 4096 chars
const MAX_VALUE = 300;

const TABLES: Record<string, string> = {
  members: '成員', groups: '團體', companies: '公司', history: '歷程', venues: '場館',
  songs: '歌曲', member_songs: '成員歌曲', group_songs: '團體歌曲',
};
const OPS: Record<string, string> = { INSERT: '新增', UPDATE: '修改', DELETE: '刪除' };

// bookkeeping columns that change on every save and say nothing to a reviewer
const SKIP = new Set(['id', 'created_at', 'updated_at', 'created_by', 'sort_order', 'is_approved']);
const EXTRA_LABELS: Record<string, string> = { notes: '備注', is_deleted: '已刪除', company: '公司(文字)', team_id: '隊伍' };
const IMAGE_FIELDS = new Set(['photo_url']);

export const REFS: Record<string, string> = {
  member_id: 'members', group_id: 'groups', company_id: 'companies', team_id: 'teams',
};
const ENUMS: Record<string, Record<string, string>> = {
  status: {
    active: '正常在籍', trainee: '研修', concurrent: '兼任', support: '支援',
    hiatus: '活休', transferred: '移籍', graduated: '畢業', withdrawn: '脫退',
  },
  photo_status: { allowed: '可拍', not_allowed: '不可拍', conditional: '條件式' },
  video_status: { allowed: '可錄', not_allowed: '不可錄', conditional: '條件式' },
};

export type Data = Record<string, unknown>;
export interface WebhookPayload { table?: string; record?: Data }
export interface Sides { kind: 'proposal' | 'audit'; table: string; op: string; recordId: string | null; before: Data; after: Data }
export interface Change { field: string; before: unknown; after: unknown }
/** id → display name, for every member/group/company/team id the event mentions */
export type Names = Record<string, string>;

const obj = (v: unknown): Data => (v && typeof v === 'object' ? v as Data : {});
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
const isEmpty = (v: unknown) => v == null || v === '';
const norm = (v: unknown) => (isEmpty(v) ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/** The row before/after the event, or null when it should not be announced. */
export function sides(p: WebhookPayload): Sides | null {
  const r = p.record;
  if (!r) return null;
  const base = { table: String(r['table_name']), op: String(r['operation']), recordId: str(r['record_id']) ?? null };
  if (p.table === 'proposals') {
    if (r['status'] !== 'pending') return null;
    return { kind: 'proposal', ...base, before: obj(r['original_data']), after: obj(r['proposed_data']) };
  }
  if (p.table === 'audit_log') return { kind: 'audit', ...base, before: obj(r['old_data']), after: obj(r['new_data']) };
  return null;
}

/** Fields worth showing: everything filled on INSERT/DELETE, only what differs on UPDATE. */
export function diff({ op, before, after }: Pick<Sides, 'op' | 'before' | 'after'>): Change[] {
  const source = op === 'DELETE' ? before : after;
  return Object.keys(source)
    .filter((k) => !SKIP.has(k))
    .filter((k) => (op === 'UPDATE' ? norm(before[k]) !== norm(after[k]) : !isEmpty(source[k])))
    .map((k) => ({ field: k, before: before[k], after: after[k] }));
}

/** Referenced ids grouped by the table that holds their names. */
export function refIds(rows: Data[]): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const row of rows) {
    for (const [field, table] of Object.entries(REFS)) {
      const id = str(row[field]);
      if (id) (out[table] ??= new Set()).add(id);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([t, ids]) => [t, [...ids]]));
}

const label = (table: string, field: string) => FIELD_LABELS[table]?.[field] ?? EXTRA_LABELS[field] ?? field;

const show = (field: string, v: unknown, names: Names): string => {
  if (isEmpty(v)) return '（空）';
  if (typeof v === 'boolean') return v ? '是' : '否';
  if (typeof v !== 'string') return JSON.stringify(v);
  const text = REFS[field] ? names[v] ?? v : ENUMS[field]?.[v] ?? v;
  return [...text].length > MAX_VALUE ? [...text].slice(0, MAX_VALUE).join('') + '…' : text;
};

function subject(table: string, ctx: Data, names: Names): string {
  const member = names[String(ctx['member_id'])] ?? str(ctx['name_at_time']);
  const groupName = names[String(ctx['group_id'])];
  const group = groupName ? `《${groupName}》` : str(ctx['external_group_name']);
  if (table === 'history') return [member, group].filter(Boolean).join(' @ ') || '（未知）';
  const owner = table === 'member_songs' ? member : table === 'group_songs' ? group : undefined;
  const title = str(ctx['name']) ?? str(ctx['title']) ?? '（未知）';
  return owner ? `${title}（${owner}）` : title;
}

/**
 * Telegram text plus any new images for a proposals / audit_log insert,
 * or null when there is nothing to announce (non-pending proposal, touch-only update).
 * `current` is the live row, used only to name the subject when the event carries a partial row.
 */
export function formatMessage(p: WebhookPayload, current: Data | null, names: Names): { text: string; photos: { label: string; url: string }[] } | null {
  const s = sides(p);
  if (!s) return null;
  const changes = diff(s);
  if (s.op === 'UPDATE' && !changes.length) return null;

  const r = p.record!;
  const ctx = { ...current, ...s.before, ...s.after };
  const line = ({ field, before, after }: Change) => {
    const name = label(s.table, field);
    if (s.op === 'UPDATE') return `• ${name}：${show(field, before, names)} → ${show(field, after, names)}`;
    return `• ${name}：${show(field, s.op === 'DELETE' ? before : after, names)}`;
  };
  const who = s.kind === 'proposal'
    ? [`提交者：${str(r['submitter_name']) ?? '匿名'}`, ...(str(r['submitter_note']) ? [`說明：${r['submitter_note']}`] : [])]
    : [`操作者：${str(r['user_email']) ?? '系統'}`];

  const text = [
    s.kind === 'proposal' ? '📝 新提案待審核' : '🛠 後台變更',
    `${TABLES[s.table] ?? s.table}${OPS[s.op] ?? s.op}：${subject(s.table, ctx, names)}`,
    ...who,
    '',
    ...changes.map(line),
    '',
    `${SITE}/admin/${s.kind === 'proposal' ? 'proposals' : 'audit-log'}`,
  ].join('\n');

  const photos = s.op === 'DELETE' ? [] : changes
    .filter((c) => IMAGE_FIELDS.has(c.field) && str(c.after)?.startsWith('http'))
    .map((c) => ({ label: label(s.table, c.field), url: c.after as string }));

  return { text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + '…' : text, photos };
}
