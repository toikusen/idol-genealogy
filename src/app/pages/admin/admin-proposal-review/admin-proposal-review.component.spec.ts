import { AdminProposalReviewComponent } from './admin-proposal-review.component';

/** The attached-history getters read only editedData; no injected service is touched. */
function review(editedData: Record<string, any>): AdminProposalReviewComponent {
  const none = null as any;
  const c = new AdminProposalReviewComponent(none, none, none, none, none);
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
