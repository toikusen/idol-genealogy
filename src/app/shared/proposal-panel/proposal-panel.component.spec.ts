import { ProposalPanelComponent } from './proposal-panel.component';

/** Neither `allowedFields` nor `isLocked` touches an injected service. */
function panel(): ProposalPanelComponent {
  const none = null as any;
  return new ProposalPanelComponent(none, none, none, none, none, none);
}

describe('ProposalPanelComponent locked fields', () => {
  it('locks nothing by default', () => {
    const p = panel();
    p.tableName = 'groups';
    expect(p.isLocked('company_id')).toBe(false);
  });

  it('reports a locked field so the template renders it read-only', () => {
    const p = panel();
    p.tableName = 'groups';
    p.lockedFields = ['company_id'];
    expect(p.isLocked('company_id')).toBe(true);
    expect(p.isLocked('founded_at')).toBe(false);
  });

  it('keeps a locked field in allowedFields so its value is submitted unchanged', () => {
    const p = panel();
    p.tableName = 'groups';
    p.lockedFields = ['company_id'];
    // Dropping it from allowedFields would leave it out of proposed_data; the
    // point is for it to round-trip untouched, not to disappear.
    expect(p.allowedFields).toContain('company_id');
    expect(p.allowedFields).toContain('founded_at');
    expect(p.allowedFields).toContain('disbanded_at');
  });
});
