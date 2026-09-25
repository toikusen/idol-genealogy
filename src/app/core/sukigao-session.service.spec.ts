import { TestBed } from '@angular/core/testing';
import { SUKIGAO_BROWSER_ID_KEY, SUKIGAO_STATE_KEY, SukigaoSessionService } from './sukigao-session.service';
import { createGame, currentBatch, togglePreliminaryPick } from './sukigao-engine';

describe('SukigaoSessionService', () => {
  let service: SukigaoSessionService;

  const game = () => {
    const g = createGame({
      sessionId: 'session-1',
      seed: 77,
      candidateVersion: '20:2026-09-01T00:00:00Z',
      candidateIds: Array.from({ length: 20 }, (_, i) => `m${i}`),
    });
    return togglePreliminaryPick(g, currentBatch(g)[0]);
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [SukigaoSessionService] });
    service = TestBed.inject(SukigaoSessionService);
  });

  afterEach(() => localStorage.clear());

  it('returns null when nothing is saved', () => {
    expect(service.load()).toBeNull();
  });

  it('serializes under the versioned key and restores the same state', () => {
    const g = game();
    service.save(g);
    expect(localStorage.getItem(SUKIGAO_STATE_KEY)).toContain('"version":2');
    expect(service.load()).toEqual(g);
  });

  it('drops state from another version', () => {
    localStorage.setItem(SUKIGAO_STATE_KEY, JSON.stringify({ ...game(), version: 99 }));
    expect(service.load()).toBeNull();
    expect(localStorage.getItem(SUKIGAO_STATE_KEY)).toBeNull();
  });

  it('drops corrupted JSON without throwing', () => {
    localStorage.setItem(SUKIGAO_STATE_KEY, '{"version":1,');
    expect(() => service.load()).not.toThrow();
    expect(localStorage.getItem(SUKIGAO_STATE_KEY)).toBeNull();
  });

  it('drops structurally invalid state', () => {
    localStorage.setItem(SUKIGAO_STATE_KEY, JSON.stringify({ version: 2, sessionId: 'x' }));
    expect(service.load()).toBeNull();
  });

  it('drops v1 saves (12-face batches) under the old key', () => {
    localStorage.setItem('idolmaps:sukigao:v1', JSON.stringify({ ...game(), version: 1 }));
    expect(service.load()).toBeNull();
    expect(localStorage.getItem('idolmaps:sukigao:v1')).toBeNull();
  });

  it('round-trips intro prefs and ignores junk', () => {
    expect(service.loadPrefs()).toBeNull();
    service.savePrefs({ scope: 'all', size: 216 });
    expect(service.loadPrefs()).toEqual({ scope: 'all', size: 216 });
    localStorage.setItem('idolmaps:sukigao:prefs', '{"scope":"nope","size":-1}');
    expect(service.loadPrefs()).toBeNull();
  });

  it('clear() removes the game but keeps the browser id', () => {
    const id = service.getBrowserId();
    service.save(game());
    service.clear();
    expect(service.load()).toBeNull();
    expect(localStorage.getItem(SUKIGAO_BROWSER_ID_KEY)).toBe(id);
  });

  it('mints a UUID browser id once and reuses it', () => {
    const id = service.getBrowserId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(service.getBrowserId()).toBe(id);
  });

  it('replaces a tampered browser id', () => {
    localStorage.setItem(SUKIGAO_BROWSER_ID_KEY, 'not-a-uuid');
    expect(service.getBrowserId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps working when storage throws', () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
    expect(() => service.save(game())).not.toThrow();
    expect(service.getBrowserId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates unsigned 32-bit seeds', () => {
    const seed = service.newSeed();
    expect(Number.isInteger(seed)).toBeTrue();
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});
