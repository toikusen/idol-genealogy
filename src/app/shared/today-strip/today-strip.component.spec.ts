import { ScheduleEvent, ScheduleResult } from '../../core/google-calendar.service';
import { toView } from './today-strip.component';

const event = (id: string, overrides: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id, title: `Show ${id}`, start: '2026-08-12T19:00:00+08:00', end: null, location: '', url: '',
  isAllDay: false, relatedGroups: [], allDayEndDayKey: null, isOngoingAllDay: false, ...overrides,
} as ScheduleEvent);

const result = (overrides: Partial<ScheduleResult> = {}): ScheduleResult => ({
  today: { dayKey: '2026-08-12', carryover: [], allDay: [], timed: [] },
  upcoming: [], status: 'ok', ...overrides,
});

describe('today strip view', () => {
  it('holds its place while loading', () => {
    expect(toView(null)).toEqual({ heading: '活動行程', rows: [], more: '看行程', note: '載入中…' });
  });

  it('counts every event today but lists only two', () => {
    const view = toView(result({
      today: { dayKey: '2026-08-12', carryover: [event('c')], allDay: [event('a')], timed: [event('t1'), event('t2')] },
    }));
    expect(view.heading).toBe('今日 4 場活動');
    expect(view.rows.map(r => r.id)).toEqual(['t1', 't2']);
    expect(view.rows[0].when).toBe('19:00');
    expect(view.more).toBe('還有 2 場');
  });

  it('falls back to the next day with events when today is empty', () => {
    const view = toView(result({ upcoming: [{ dayKey: '2026-08-14', events: [event('n')] }] }));
    expect(view.heading).toBe('下一場 08/14（週五）');
    expect(view.rows).toEqual([{ id: 'n', when: '08/14 19:00', title: 'Show n' }]);
  });

  it('tops up a quiet day with the next upcoming event', () => {
    const view = toView(result({
      today: { dayKey: '2026-08-12', carryover: [], allDay: [], timed: [event('t1')] },
      upcoming: [{ dayKey: '2026-08-14', events: [event('n')] }],
    }));
    expect(view.heading).toBe('今日 1 場活動');
    expect(view.rows.map(r => r.when)).toEqual(['19:00', '08/14 19:00']);
    expect(view.more).toBe('看行程');
  });

  it('never claims an empty day when the calendar failed', () => {
    const view = toView(result({ status: 'error' }));
    expect(view.rows).toEqual([]);
    expect(view.note).not.toContain('暫無');
  });

  it('says so when nothing is scheduled', () => {
    expect(toView(result()).note).toBe('未來 14 天暫無已知活動');
  });
});
