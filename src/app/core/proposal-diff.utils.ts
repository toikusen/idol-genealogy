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
