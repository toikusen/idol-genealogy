import { hasCareerEnded } from './member-career.utils';

describe('hasCareerEnded', () => {
  it('is true when every history entry has ended', () => {
    expect(hasCareerEnded([{ status: 'graduated' }, { status: 'transferred' }, { status: 'withdrawn' }])).toBeTrue();
  });

  it('is false while any entry is still ongoing', () => {
    expect(hasCareerEnded([{ status: 'graduated' }, { status: 'active' }])).toBeFalse();
    expect(hasCareerEnded([{ status: 'graduated' }, { status: 'hiatus' }])).toBeFalse();
    expect(hasCareerEnded([{ status: 'graduated' }, { status: null }])).toBeFalse();
  });

  it('is false for a member with no recorded history', () => {
    expect(hasCareerEnded([])).toBeFalse();
  });
});
