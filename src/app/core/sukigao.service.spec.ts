import { TestBed } from '@angular/core/testing';
import { SukigaoService, buildAdminStats, buildPool, buildStats } from './sukigao.service';
import { SupabaseService } from './supabase.service';

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `name-${id}`,
  name_roman: null,
  nickname: null,
  photo_url: `https://x.supabase.co/storage/v1/object/public/member-photos/${id}.jpg`,
  color: null,
  group_names: ['A'],
  updated_at: '2026-09-01T00:00:00+00:00',
  ...overrides,
});

describe('SukigaoService', () => {
  let rpc: jasmine.Spy;
  let service: SukigaoService;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc');
    TestBed.configureTestingModule({
      providers: [SukigaoService, { provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    service = TestBed.inject(SukigaoService);
  });

  // Unless a test says otherwise, the edge endpoint is unavailable.
  beforeEach(() => {
    spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 404 }));
  });

  describe('buildStats', () => {
    it('parses bigint strings; plays falls back to total before migration 115', () => {
      expect(buildStats({ total: '120', players: '90' })).toEqual({ total: 120, plays: 120, players: 90 });
      expect(buildStats({ total: 10, plays: '27', players: 8 }).plays).toBe(27);
    });

    it('keeps no per-member numbers even if a payload carries them', () => {
      const s = buildStats({ total: 3, players: 2, members: [{ member_id: 'a', top9: 3, first: 1 }] } as never);
      expect(Object.keys(s).sort()).toEqual(['players', 'plays', 'total']);
    });
  });

  describe('buildAdminStats', () => {
    it('normalises bigint strings and missing sections', () => {
      const s = buildAdminStats({
        total: '5', plays: '9', players: '4',
        members: [{ member_id: 'a', name: 'A', top9: '5', first: '2' }],
        setups: [{ scope: null, size: null, results: '5' }],
      });
      expect(s.members).toEqual([{ member_id: 'a', name: 'A', top9: 5, first: 2 }]);
      expect(s.setups).toEqual([{ scope: '', size: 0, results: 5 }]);
      expect(s.daily).toEqual([]);
      expect(s.plays).toBe(9);
    });
  });

  describe('buildPool', () => {
    it('counts members and distinct groups dynamically', () => {
      const pool = buildPool([
        row('1', { group_names: ['A', 'B'] }),
        row('2', { group_names: ['B'] }),
        row('3', { group_names: [] }),
      ]);
      expect(pool.candidates.length).toBe(3);
      expect(pool.groupCount).toBe(2);
    });

    it('drops rows without a photo and test records', () => {
      const pool = buildPool([row('1'), row('2', { photo_url: null }), row('3', { name: '測試帳號' })]);
      expect(pool.candidates.map(c => c.id)).toEqual(['1']);
    });

    it('versions the pool by count + newest updated_at', () => {
      const pool = buildPool([row('1'), row('2', { updated_at: '2026-09-20T10:00:00+00:00' })]);
      expect(pool.version).toBe('2:2026-09-20T10:00:00+00:00');
    });
  });

  it('getPool() prefers the edge-cached endpoint', async () => {
    const fetchSpy = (window.fetch as jasmine.Spy).and.resolveTo(
      new Response(JSON.stringify([row('1'), row('2')]), { headers: { 'Content-Type': 'application/json' } }),
    );
    const pool = await service.getPool();
    expect(fetchSpy).toHaveBeenCalledWith('/api/sukigao-candidates', jasmine.any(Object));
    expect(pool.candidates.length).toBe(2);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('getPool() falls back to Supabase when the edge endpoint fails', async () => {
    (window.fetch as jasmine.Spy).and.resolveTo(new Response('nope', { status: 502 }));
    rpc.and.resolveTo({ data: [row('1')], error: null });
    const pool = await service.getPool();
    expect(rpc).toHaveBeenCalledOnceWith('get_sukigao_candidates');
    expect(pool.candidates.length).toBe(1);
  });

  it('getPool() falls back when the edge returns HTML (e.g. SPA shell)', async () => {
    (window.fetch as jasmine.Spy).and.resolveTo(new Response('<html>', { headers: { 'Content-Type': 'text/html' } }));
    rpc.and.resolveTo({ data: [row('1')], error: null });
    await service.getPool();
    expect(rpc).toHaveBeenCalled();
  });

  it('getPool() calls the candidates RPC once and caches it', async () => {
    rpc.and.resolveTo({ data: [row('1')], error: null });
    await service.getPool();
    await service.getPool();
    expect(rpc).toHaveBeenCalledOnceWith('get_sukigao_candidates');
  });

  it('getPool() surfaces RPC errors', async () => {
    rpc.and.resolveTo({ data: null, error: new Error('boom') });
    await expectAsync(service.getPool()).toBeRejected();
  });

  it('submit() sends the token, ordered ids and version', async () => {
    rpc.and.resolveTo({ data: { submitted_on: '2026-09-25', replaced: true }, error: null });
    const ids = Array.from({ length: 9 }, (_, i) => `m${i}`);
    const res = await service.submit('token', ids, 'v1');
    expect(rpc).toHaveBeenCalledOnceWith('submit_sukigao_result', {
      p_browser_token: 'token',
      p_member_ids: ids,
      p_candidate_version: 'v1',
    });
    expect(res).toEqual({ submittedOn: '2026-09-25', replaced: true });
  });

  it('getStats() falls back to the public summary RPC', async () => {
    rpc.and.resolveTo({ data: { total: 4, plays: 6, players: 3 }, error: null });
    expect(await service.getStats()).toEqual({ total: 4, plays: 6, players: 3 });
    expect(rpc).toHaveBeenCalledOnceWith('get_sukigao_summary');
  });

  it('getPlayCount() reads the edge endpoint only', async () => {
    (window.fetch as jasmine.Spy).and.resolveTo(new Response(JSON.stringify({ total: 4, plays: 6, players: 3 }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(await service.getPlayCount()).toBe(6);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('getAdminStats() calls the staff-only RPC and surfaces its refusal', async () => {
    rpc.and.resolveTo({ data: null, error: new Error('get_sukigao_admin_stats: staff only') });
    await expectAsync(service.getAdminStats()).toBeRejectedWithError(/staff only/);
    expect(rpc).toHaveBeenCalledOnceWith('get_sukigao_admin_stats');
  });
});
