import { taipeiDateParts, taipeiDayKey, taipeiStartOfDay, taipeiTime } from './taipei-date.utils';

describe('taipei-date.utils', () => {
  it('taipeiStartOfDay returns Taipei midnight (16:00Z previous day)', () => {
    // 2026-08-11T02:00Z is 10:00 in Taipei on the 11th.
    expect(taipeiStartOfDay(new Date('2026-08-11T02:00:00Z')).toISOString())
      .toBe('2026-08-10T16:00:00.000Z');
  });

  it('taipeiStartOfDay rolls to the next Taipei day after 16:00Z', () => {
    // 2026-08-11T17:00Z is already 01:00 on the 12th in Taipei.
    expect(taipeiStartOfDay(new Date('2026-08-11T17:00:00Z')).toISOString())
      .toBe('2026-08-11T16:00:00.000Z');
  });

  it('taipeiDayKey groups a late-evening event under its Taipei date', () => {
    // 23:30 Taipei on the 15th is 15:30Z the same day — UTC would agree here…
    expect(taipeiDayKey('2026-08-15T23:30:00+08:00')).toBe('2026-08-15');
    // …but 00:30 Taipei on the 16th is 16:30Z on the 15th, where UTC would not.
    expect(taipeiDayKey('2026-08-16T00:30:00+08:00')).toBe('2026-08-16');
  });

  it('taipeiDateParts formats month, day and weekday', () => {
    expect(taipeiDateParts('2026-08-15T19:00:00+08:00'))
      .toEqual({ month: '08', day: '15', weekday: '週六' });
  });

  it('taipeiDateParts is stable for an instant expressed in UTC', () => {
    // Same instant as above, written as UTC.
    expect(taipeiDateParts('2026-08-15T11:00:00Z'))
      .toEqual({ month: '08', day: '15', weekday: '週六' });
  });

  it('taipeiTime formats HH:mm in Taipei regardless of input zone', () => {
    expect(taipeiTime('2026-08-15T19:00:00+08:00')).toBe('19:00');
    expect(taipeiTime('2026-08-15T11:00:00Z')).toBe('19:00');
  });
});
