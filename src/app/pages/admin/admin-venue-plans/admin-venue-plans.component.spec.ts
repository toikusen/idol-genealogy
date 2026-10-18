import { FEEDBACK_LABELS, safeViewLink } from './admin-venue-plans.component';

describe('view feedback helpers', () => {
  it('links only back into the 別擋我推 page', () => {
    expect(safeViewLink('https://idolmaps.com/view#v=jack&t=30')).toBe('https://idolmaps.com/view#v=jack&t=30');
    expect(safeViewLink('javascript:alert(1)')).toBeNull();
    expect(safeViewLink('https://evil.example/view#v=jack')).toBeNull();
    expect(safeViewLink('https://idolmaps.com.evil.example/view#x')).toBeNull();
    expect(safeViewLink(null)).toBeNull();
  });

  it('labels every category the database allows', () => {
    expect(Object.keys(FEEDBACK_LABELS).sort()).toEqual(['bug', 'idea', 'other', 'venue']);
  });
});
