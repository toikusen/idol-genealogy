import { hasLeft } from './group-connection-graph.component';

describe('hasLeft', () => {
  const now = new Date('2026-07-21');

  it('treats a future left_at as still active', () => {
    expect(hasLeft('2026-11-15', now)).toBe(false);
  });

  it('treats a past left_at as graduated', () => {
    expect(hasLeft('2025-01-01', now)).toBe(true);
  });

  it('treats no left_at as active', () => {
    expect(hasLeft(null, now)).toBe(false);
  });
});
