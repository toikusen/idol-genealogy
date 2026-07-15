import { getDiffFields, getDeleteSummary, getEffectiveProposed } from './proposal-diff.utils';
import { Proposal } from '../models';

const baseProposal: Proposal = {
  id: '1', table_name: 'members', record_id: 'm1', operation: 'UPDATE',
  proposed_data: { name: 'New Name' }, original_data: { name: 'Old Name' },
  reviewed_data: null, status: 'approved', submitter_id: null,
  submitter_name: 'Alice', submitter_email: null,
  reviewer_note: null, submitter_note: null, created_at: '', reviewed_at: null, reviewed_by: null,
};

describe('getEffectiveProposed', () => {
  it('returns reviewed_data when present', () => {
    const p = { ...baseProposal, reviewed_data: { name: 'Reviewed' } };
    expect(getEffectiveProposed(p)).toEqual({ name: 'Reviewed' });
  });

  it('falls back to proposed_data when reviewed_data is null', () => {
    expect(getEffectiveProposed(baseProposal)).toEqual({ name: 'New Name' });
  });
});

describe('getDeleteSummary', () => {
  it('never shows raw ids for a history delete', () => {
    const p: Proposal = {
      ...baseProposal, table_name: 'history', operation: 'DELETE',
      original_data: { member_id: 'b4e69f99-03ba-4deb-b873-96b8fb6ab0dd', group_id: 'g1' },
    };
    expect(getDeleteSummary(p)).toBe('刪除了一筆歷程紀錄');
  });

  it('uses name_at_time for a history delete when present', () => {
    const p: Proposal = {
      ...baseProposal, table_name: 'history', operation: 'DELETE',
      original_data: { member_id: 'm1', name_at_time: 'みるく' },
    };
    expect(getDeleteSummary(p)).toBe('刪除了「みるく」的歷程紀錄');
  });

  it('uses song title for a song delete', () => {
    const p: Proposal = {
      ...baseProposal, table_name: 'member_songs', operation: 'DELETE',
      original_data: { member_id: 'm1', title: 'Sunrise' },
    };
    expect(getDeleteSummary(p)).toBe('刪除了歌曲「Sunrise」');
  });

  it('uses name for other tables', () => {
    const p: Proposal = { ...baseProposal, operation: 'DELETE' };
    expect(getDeleteSummary(p)).toBe('刪除了「Old Name」');
  });
});

describe('getDiffFields - UPDATE', () => {
  it('returns diff fields in PROPOSAL_ALLOWED_FIELDS order', () => {
    const fields = getDiffFields(baseProposal);
    expect(fields.length).toBe(1);
    expect(fields[0].key).toBe('name');
    expect(fields[0].oldValue).toBe('Old Name');
    expect(fields[0].newValue).toBe('New Name');
    expect(fields[0].label).toBe('姓名');
  });

  it('shows "—" for empty original value', () => {
    const p = { ...baseProposal, original_data: { name: '' }, proposed_data: { name: 'Alice' } };
    const fields = getDiffFields(p);
    expect(fields[0].oldValue).toBe('—');
  });

  it('uses reviewed_data over proposed_data', () => {
    const p = { ...baseProposal, reviewed_data: { name: 'Admin Edit' } };
    const fields = getDiffFields(p);
    expect(fields[0].newValue).toBe('Admin Edit');
  });
});

describe('getDiffFields - INSERT', () => {
  it('returns proposed fields with oldValue "—"', () => {
    const p: Proposal = {
      ...baseProposal, operation: 'INSERT',
      original_data: null, proposed_data: { name: 'Brand New' },
    };
    const fields = getDiffFields(p);
    expect(fields[0].oldValue).toBe('—');
    expect(fields[0].newValue).toBe('Brand New');
  });

  it('omits empty fields from INSERT diff', () => {
    const p: Proposal = {
      ...baseProposal, operation: 'INSERT',
      original_data: null, proposed_data: { name: 'Alice', nickname: '' },
    };
    const fields = getDiffFields(p);
    expect(fields.every(f => f.key !== 'nickname')).toBeTrue();
  });
});
