import { Injectable } from '@angular/core';
import { SukigaoGameState, isGameState } from './sukigao-engine';

export const SUKIGAO_STATE_KEY = 'idolmaps:sukigao:v1';
export const SUKIGAO_BROWSER_ID_KEY = 'idolmaps:sukigao:browser-id';

/**
 * The only place 顏控9選 touches localStorage. Every access is guarded for SSR
 * and for browsers that throw on storage (private mode, blocked site data):
 * losing progress there is acceptable, crashing the page is not.
 */
@Injectable({ providedIn: 'root' })
export class SukigaoSessionService {
  private get storage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  /** The saved game, or null when there is none or it is unreadable / from another version. */
  load(): SukigaoGameState | null {
    const storage = this.storage;
    if (!storage) return null;
    let raw: string | null;
    try {
      raw = storage.getItem(SUKIGAO_STATE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isGameState(parsed)) return parsed;
    } catch {
      // fall through: corrupted JSON is dropped like an unknown version
    }
    this.clear();
    return null;
  }

  save(state: SukigaoGameState): void {
    try {
      this.storage?.setItem(SUKIGAO_STATE_KEY, JSON.stringify(state));
    } catch {
      // Quota / blocked storage: the game keeps running in memory.
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(SUKIGAO_STATE_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Anonymous per-browser token for the once-a-day vote rule. Random, never
   * derived from the device, and only ever sent to the submit RPC, which
   * stores a hash of it — not the token itself.
   */
  getBrowserId(): string {
    const storage = this.storage;
    try {
      const existing = storage?.getItem(SUKIGAO_BROWSER_ID_KEY);
      if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    } catch {
      // fall through and mint a fresh one
    }
    const id = randomUuid();
    try {
      storage?.setItem(SUKIGAO_BROWSER_ID_KEY, id);
    } catch {
      // ignore
    }
    return id;
  }

  newSessionId(): string {
    return randomUuid();
  }

  newSeed(): number {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      return crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }
}

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback for older browsers without randomUUID.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
