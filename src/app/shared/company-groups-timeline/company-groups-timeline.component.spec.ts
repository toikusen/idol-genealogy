import { buildGroupTimeline } from './company-groups-timeline.component';
import { Group } from '../../models';

// Local midnight, matching how the component parses stored dates.
const NOW = new Date(2026, 0, 1).getTime();

function group(id: string, founded_at: string | null, disbanded_at: string | null = null): Group {
  return { id, name: id, founded_at, disbanded_at } as Group;
}

describe('buildGroupTimeline', () => {
  it('anchors the earliest group at 0% and runs an active group to the right edge', () => {
    const { rows } = buildGroupTimeline(
      [group('b', '2022-01-01'), group('a', '2020-01-01', '2021-01-01')],
      NOW
    );

    expect(rows.map(r => r.group.id)).toEqual(['a', 'b']);
    expect(rows[0].leftPct).toBe(0);
    expect(rows[0].isActive).toBe(false);
    expect(rows[1].leftPct + rows[1].widthPct).toBeCloseTo(100, 5);
    expect(rows[1].isActive).toBe(true);
  });

  it('treats a future disbanded_at as still active', () => {
    const { rows } = buildGroupTimeline([group('a', '2020-01-01', '2027-06-01')], NOW);
    expect(rows[0].isActive).toBe(true);
  });

  it('does not divide by zero when a single group was founded today', () => {
    const { rows } = buildGroupTimeline([group('a', '2026-01-01')], NOW);
    expect(rows[0].leftPct).toBe(0);
    expect(Number.isFinite(rows[0].widthPct)).toBe(true);
    expect(rows[0].widthPct).toBeGreaterThan(0);
  });

  it('counts undated groups instead of plotting them', () => {
    const { rows, undatedCount } = buildGroupTimeline(
      [group('a', '2020-01-01'), group('b', null), group('c', null)],
      NOW
    );
    expect(rows.length).toBe(1);
    expect(undatedCount).toBe(2);
  });

  it('returns an empty timeline when no group has a founding date', () => {
    const { rows, years, undatedCount } = buildGroupTimeline([group('a', null)], NOW);
    expect(rows).toEqual([]);
    expect(years).toEqual([]);
    expect(undatedCount).toBe(1);
  });

  it('thins out year labels on a long span and keeps the first tick on the axis', () => {
    const { years } = buildGroupTimeline([group('a', '1995-01-01')], NOW);
    const labels = years.map(y => Number(y.label));
    expect(labels[0]).toBe(1995);
    expect(years[0].leftPct).toBe(0);
    expect(labels[1] - labels[0]).toBe(5);
    expect(years.every(y => y.leftPct >= 0 && y.leftPct <= 100)).toBe(true);
  });

  it('accepts a partial founding date', () => {
    const { rows } = buildGroupTimeline([group('a', '2020'), group('b', '2020-06')], NOW);
    expect(rows.map(r => r.group.id)).toEqual(['a', 'b']);
    expect(rows[0].leftPct).toBe(0);
    expect(rows[1].leftPct).toBeGreaterThan(0);
  });
});
