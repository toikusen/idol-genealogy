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

describe('ProposalPanelComponent history group requirement', () => {
  it('requires group_id for a Taiwan-group history', () => {
    const p = panel();
    p.tableName = 'history';
    p.requiredFields = ['group_id', 'status', 'joined_at'];
    expect(p.effectiveRequiredFields).toEqual(['group_id', 'status', 'joined_at']);
  });

  it('swaps group_id for external_group_name on an overseas/solo history', () => {
    const p = panel();
    p.tableName = 'history';
    p.requiredFields = ['group_id', 'status', 'joined_at'];
    p.isExternalRecord = true;
    expect(p.effectiveRequiredFields).toEqual(['external_group_name', 'status', 'joined_at']);
    expect(p.fieldLabel('external_group_name').endsWith(' *')).toBe(true);
  });
});

describe('ProposalPanelComponent attached history', () => {
  function memberInsert() {
    const p = panel();
    p.tableName = 'members';
    p.operation = 'INSERT';
    return p;
  }

  it('attaches nothing when the section is empty or only whitespace', () => {
    const p = memberInsert();
    p.attachHistory.external_group_name = '   ';
    expect(p.attachedHistoryPayload()).toEqual({ history: null, missing: [] });
  });

  it('reports missing required fields once the section is started', () => {
    const p = memberInsert();
    p.attachHistory.group_id = 'g1';
    expect(p.attachedHistoryPayload().missing).toEqual(['status', 'joined_at']);
  });

  it('builds a Taiwan-group entry and ignores the overseas fields', () => {
    const p = memberInsert();
    Object.assign(p.attachHistory, { group_id: 'g1', status: 'active', external_group_name: 'AKB48' });
    p.joinedYear = 2024; p.joinedMonth = 3; p.joinedDay = 5;
    expect(p.attachedHistoryPayload()).toEqual({
      history: { group_id: 'g1', status: 'active', joined_at: '2024-03-05' },
      missing: [],
    });
  });

  it('requires external_group_name instead of group_id for overseas/solo', () => {
    const p = memberInsert();
    p.isExternalRecord = true;
    Object.assign(p.attachHistory, { group_id: 'g1', status: 'active' });
    p.joinedYear = 2024; p.joinedMonth = 3; p.joinedDay = 5;
    expect(p.attachedHistoryPayload()).toEqual({
      history: { status: 'active', joined_at: '2024-03-05' },
      missing: ['external_group_name'],
    });
  });
});
