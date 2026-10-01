import { AttachedHistoryError } from '../../../core/proposal.service';
import { AdminProposalReviewComponent } from './admin-proposal-review.component';

/** The attached-history getters read only proposal and editedData; no injected service is touched. */
function review(editedData: Record<string, any>): AdminProposalReviewComponent {
  const none = null as any;
  const c = new AdminProposalReviewComponent(none, none, none, none, none);
  c.proposal = { proposed_data: structuredClone(editedData) } as any;
  c.editedData = editedData;
  return c;
}

describe('AdminProposalReviewComponent attached history', () => {
  it('lists the attached history fields in history field order', () => {
    const c = review({ name: '和希', _history: { joined_at: '2024-01-01', status: 'active', group_id: 'g1' } });
    expect(c.attachedHistoryEntries.map(e => e.key)).toEqual(['group_id', 'status', 'joined_at']);
  });

  it('lists nothing when no history is attached', () => {
    expect(review({ name: '和希' }).attachedHistoryEntries).toEqual([]);
  });

  it('drops the attached history so approval creates only the member', () => {
    const c = review({ name: '和希', _history: { group_id: 'g1' } });
    c.removeAttachedHistory();
    expect(c.editedData).toEqual({ name: '和希' });
  });
});

describe('AdminProposalReviewComponent approving an attached history', () => {
  const memberProposal = () => ({
    id: 'p1', table_name: 'members', operation: 'INSERT', status: 'pending', record_id: null,
    proposed_data: { name: '和希', _history: { group_id: 'g1', status: 'active', joined_at: '2024-01-01' } },
  } as any);

  function withApprove(approve: jasmine.Spy) {
    const none = null as any;
    const router = { navigate: jasmine.createSpy('navigate') };
    const c = new AdminProposalReviewComponent(none, router as any, { approve } as any, none, none);
    const proposal = memberProposal();
    c.proposal = proposal;
    c.editedData = structuredClone(proposal.proposed_data);
    return c;
  }

  it('keeps a cleared row editable instead of dropping it', () => {
    const c = withApprove(jasmine.createSpy());
    c.editedData['_history'].joined_at = '';
    expect(c.attachedHistoryEntries.map(e => e.key)).toContain('joined_at');
  });

  it('drops blank attached fields before approving', async () => {
    const approve = jasmine.createSpy().and.returnValue(Promise.resolve());
    const c = withApprove(approve);
    c.editedData['_history'].status = '  ';
    await c.approve();
    expect(approve.calls.mostRecent().args[1]._history).toEqual({ group_id: 'g1', joined_at: '2024-01-01' });
  });

  it('treats an attached history with every field cleared as removed', async () => {
    const approve = jasmine.createSpy().and.returnValue(Promise.resolve());
    const c = withApprove(approve);
    c.editedData['_history'] = { group_id: '', status: ' ', joined_at: '' };
    await c.approve();
    expect(approve.calls.mostRecent().args[1]).toEqual({ name: '和希' });
  });

  it('marks the proposal approved when only the attached history failed, so it cannot be approved twice', async () => {
    const approve = jasmine.createSpy().and.returnValue(Promise.reject(new AttachedHistoryError('boom')));
    const c = withApprove(approve);
    await c.approve();
    expect(c.proposal!.status).toBe('approved');
    expect(c.error).toContain('成員已建立');
  });
});
