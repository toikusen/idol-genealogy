import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  it('caches a resolved value and reuses it within the TTL', async () => {
    const cache = new TtlCache<number>(10_000);
    const loader = jasmine.createSpy('loader').and.resolveTo(42);

    expect(await cache.get('k', loader)).toBe(42);
    expect(await cache.get('k', loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('de-duplicates concurrent calls for the same key', async () => {
    const cache = new TtlCache<number>(10_000);
    const loader = jasmine.createSpy('loader').and.callFake(
      () => new Promise<number>(resolve => setTimeout(() => resolve(7), 0))
    );

    const [a, b] = await Promise.all([cache.get('k', loader), cache.get('k', loader)]);
    expect(a).toBe(7);
    expect(b).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('keeps separate entries per key', async () => {
    const cache = new TtlCache<string>(10_000);
    await cache.get('a', () => Promise.resolve('A'));
    await cache.get('b', () => Promise.resolve('B'));

    expect(await cache.get('a', () => Promise.resolve('X'))).toBe('A');
    expect(await cache.get('b', () => Promise.resolve('Y'))).toBe('B');
  });

  it('re-fetches after the TTL elapses', async () => {
    let now = 1_000;
    spyOn(Date, 'now').and.callFake(() => now);
    const cache = new TtlCache<number>(100);
    const loader = jasmine.createSpy('loader').and.returnValues(
      Promise.resolve(1),
      Promise.resolve(2)
    );

    expect(await cache.get('k', loader)).toBe(1);
    now += 101;
    expect(await cache.get('k', loader)).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not cache rejected loaders and retries on the next call', async () => {
    const cache = new TtlCache<number>(10_000);
    const loader = jasmine.createSpy('loader').and.returnValues(
      Promise.reject(new Error('boom')),
      Promise.resolve(99)
    );

    await expectAsync(cache.get('k', loader)).toBeRejected();
    expect(await cache.get('k', loader)).toBe(99);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('invalidate(key) drops only that key', async () => {
    const cache = new TtlCache<string>(10_000);
    await cache.get('a', () => Promise.resolve('A'));
    await cache.get('b', () => Promise.resolve('B'));

    cache.invalidate('a');

    expect(await cache.get('a', () => Promise.resolve('A2'))).toBe('A2');
    expect(await cache.get('b', () => Promise.resolve('B2'))).toBe('B');
  });

  it('invalidate() with no key clears everything', async () => {
    const cache = new TtlCache<string>(10_000);
    await cache.get('a', () => Promise.resolve('A'));

    cache.invalidate();

    expect(await cache.get('a', () => Promise.resolve('A2'))).toBe('A2');
  });

  it('does not cache an in-flight value resolved after invalidation', async () => {
    const cache = new TtlCache<string>(10_000);
    let resolveStale!: (value: string) => void;
    const stalePromise = new Promise<string>(resolve => {
      resolveStale = resolve;
    });

    const first = cache.get('a', () => stalePromise);
    cache.invalidate('a');
    resolveStale('stale');

    expect(await first).toBe('stale');
    expect(await cache.get('a', () => Promise.resolve('fresh'))).toBe('fresh');
  });

  it('keeps unrelated in-flight keys cacheable when invalidating one key', async () => {
    const cache = new TtlCache<string>(10_000);
    let resolveB!: (value: string) => void;
    const bPromise = new Promise<string>(resolve => {
      resolveB = resolve;
    });

    const b = cache.get('b', () => bPromise);
    cache.invalidate('a');
    resolveB('B');

    expect(await b).toBe('B');
    expect(await cache.get('b', () => Promise.resolve('B2'))).toBe('B');
  });
});
