import { ProposalPanelComponent } from './proposal-panel.component';

/**
 * `allowedFields` touches none of the injected services, and both the form loop
 * and the proposed_data loop read it — so a field it drops is neither shown nor
 * submitted.
 */
function panel(): ProposalPanelComponent {
  const none = null as any;
  return new ProposalPanelComponent(none, none, none, none, none, none);
}

describe('ProposalPanelComponent.allowedFields', () => {
  it('offers the company dropdown by default', () => {
    const p = panel();
    p.tableName = 'groups';
    expect(p.allowedFields).toContain('company_id');
  });

  it('drops a hidden field so the proposal cannot touch it', () => {
    const p = panel();
    p.tableName = 'groups';
    p.hiddenFields = ['company_id'];

    expect(p.allowedFields).not.toContain('company_id');
    // The fields the company page opens the panel for must survive.
    expect(p.allowedFields).toContain('founded_at');
    expect(p.allowedFields).toContain('disbanded_at');
  });

  it('keeps applying the history internal/external filter alongside hidden fields', () => {
    const p = panel();
    p.tableName = 'history';
    p.hiddenFields = ['name_at_time'];

    const fields = p.allowedFields;
    expect(fields).not.toContain('name_at_time');
    expect(fields).not.toContain('external_group_name');
    expect(fields).toContain('group_id');
  });
});
