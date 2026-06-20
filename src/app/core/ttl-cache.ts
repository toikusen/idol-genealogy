/**
 * In-memory cache with per-key TTL and in-flight request de-duplication.
 *
 * Designed for read-through caching of async data sources (e.g. Supabase
 * queries) where the same value is requested repeatedly during a session:
 * - Concurrent callers for the same key share a single in-flight promise.
 * - A resolved value is reused until its TTL elapses, then re-fetched lazily.
 * - Errors are never cached — a rejected loader propagates to all current
 *   waiters and the next call retries from scratch.
 *
 * Safe as a `providedIn: 'root'` singleton field: keys scope the data, the TTL
 * bounds staleness, and {@link invalidate} clears entries after writes.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();
  private readonly versions = new Map<string, number>();
  private globalVersion = 0;

  constructor(private readonly ttlMs: number) {}

  /**
   * Return the cached value for `key` if fresh, otherwise run `loader`, cache
   * its result, and return it. Concurrent calls for the same key share one
   * loader invocation.
   */
  get(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const globalVersion = this.globalVersion;
    const keyVersion = this.versions.get(key) ?? 0;
    const promise = loader()
      .then(value => {
        if (globalVersion === this.globalVersion && keyVersion === (this.versions.get(key) ?? 0)) {
          this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        }
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
        return value;
      })
      .catch(err => {
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
        throw err;
      });
    this.inflight.set(key, promise);
    return promise;
  }

  /** Drop a single key, or the whole cache when `key` is omitted. */
  invalidate(key?: string): void {
    if (key === undefined) {
      this.globalVersion++;
      this.store.clear();
      this.inflight.clear();
      this.versions.clear();
      return;
    }
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    this.store.delete(key);
    this.inflight.delete(key);
  }
}
