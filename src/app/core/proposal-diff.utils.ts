import { FIELD_LABELS, PROPOSAL_ALLOWED_FIELDS } from './proposal-fields.config';
import { Proposal } from '../models';

export interface DiffField {
  key: string;
  label: string;
  oldValue: string;
  newValue: string;
}

export function getEffectiveProposed(p: Proposal): Record<string, any> {
  return (p.reviewed_data ?? p.proposed_data ?? {});
}

/** One-line description of a DELETE proposal for the public edit-history
 *  summary. Never surfaces raw ids — history/song rows lead with uuid
 *  columns, so falls back to a table-kind label instead. */
export function getDeleteSummary(p: Proposal): string {
  const original = (p.original_data ?? {}) as Record<string, any>;
  if (p.table_name === 'member_songs' || p.table_name === 'group_songs') {
    return original['title'] ? `刪除了歌曲「${original['title']}」` : '刪除了歌曲';
  }
  if (p.table_name === 'history') {
    return original['name_at_time']
      ? `刪除了「${original['name_at_time']}」的歷程紀錄`
      : '刪除了一筆歷程紀錄';
  }
  return original['name'] ? `刪除了「${original['name']}」` : '刪除了資料';
}

/** Who/what a related-record proposal belongs to when shown on another
 *  record's page — the member of a history row on a group page
 *  (subjectIdField 'member_id'), the group on a member page ('group_id'),
 *  or a song's title. Null for main-record proposals. */
export function getRelatedSubjectName(
  p: Proposal,
  subjectIdField: 'member_id' | 'group_id',
  resolveName: (id: string) => string | undefined,
): string | null {
  const data = { ...(p.original_data ?? {}), ...getEffectiveProposed(p) };
  if (p.table_name === 'history') {
    const resolved = data[subjectIdField] ? resolveName(data[subjectIdField]) : undefined;
    if (resolved) return resolved;
    return subjectIdField === 'member_id' ? (data['name_at_time'] ?? null) : null;
  }
  if (p.table_name === 'member_songs' || p.table_name === 'group_songs') {
    return data['title'] ?? null;
  }
  return null;
}

export function getDiffFields(p: Proposal): DiffField[] {
  const proposed = getEffectiveProposed(p);
  const allowedKeys: string[] = PROPOSAL_ALLOWED_FIELDS[p.table_name] ?? Object.keys(proposed);

  if (p.operation === 'INSERT') {
    return allowedKeys
      .filter(k => proposed[k] != null && proposed[k] !== '')
      .map(k => ({
        key: k,
        label: FIELD_LABELS[p.table_name]?.[k] ?? k,
        oldValue: '—',
        newValue: String(proposed[k]),
      }));
  }

  if (p.operation === 'DELETE') {
    const original = (p.original_data ?? {}) as Record<string, any>;
    return allowedKeys
      .filter(k => original[k] != null && original[k] !== '')
      .map(k => ({
        key: k,
        label: FIELD_LABELS[p.table_name]?.[k] ?? k,
        oldValue: String(original[k]),
        newValue: '—',
      }));
  }

  // UPDATE — only show fields that actually changed
  const original = (p.original_data ?? {}) as Record<string, any>;
  return allowedKeys
    .filter(k => {
      if (!(k in proposed)) return false;
      const oldVal = (original[k] != null && original[k] !== '') ? String(original[k]) : '';
      const newVal = (proposed[k] != null && proposed[k] !== '') ? String(proposed[k]) : '';
      return oldVal !== newVal;
    })
    .map(k => ({
      key: k,
      label: FIELD_LABELS[p.table_name]?.[k] ?? k,
      oldValue: (original[k] != null && original[k] !== '') ? String(original[k]) : '—',
      newValue: (proposed[k] != null && proposed[k] !== '') ? String(proposed[k]) : '—',
    }));
}
