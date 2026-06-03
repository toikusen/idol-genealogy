import { resolveAllowedExternalEventUrl } from './external-event-url.utils';

describe('resolveAllowedExternalEventUrl', () => {
  it('allows TimeTree event URLs', () => {
    expect(resolveAllowedExternalEventUrl('https://timetreeapp.com/public_calendars/abc/events/123'))
      .toBe('https://timetreeapp.com/public_calendars/abc/events/123');
  });

  it('allows encoded TimeTree URLs', () => {
    const target = 'https://timetr.ee/p/example';
    expect(resolveAllowedExternalEventUrl(encodeURIComponent(target))).toBe(target);
  });

  it('does not double-decode query values that Angular has already decoded', () => {
    const target = 'https://timetreeapp.com/public_calendars/abc/events/123?title=%E3%82%A2%E3%82%A4%E3%83%89%E3%83%AB';
    expect(resolveAllowedExternalEventUrl(target)).toBe(target);
  });

  it('rejects non-TimeTree URLs', () => {
    expect(resolveAllowedExternalEventUrl('https://example.com/event')).toBeNull();
  });

  it('rejects non-HTTPS TimeTree URLs', () => {
    expect(resolveAllowedExternalEventUrl('http://timetreeapp.com/public_calendars/abc')).toBeNull();
  });
});
