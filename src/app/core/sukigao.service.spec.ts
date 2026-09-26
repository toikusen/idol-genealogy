import { TestBed } from '@angular/core/testing';
import { SukigaoService, buildPool, buildStats } from './sukigao.service';
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
    it('parses bigint strings and finds the leaders', () => {
      const s = buildStats({
        total: '120',
        players: '90',
        members: [
          { member_id: 'a', top9: '50', first: '5' },
          { member_id: 'b', top9: '40', first: '20' },
        ],
      });
      expect(s.total).toBe(120);
      expect(s.plays).toBe(120); // no 'plays' before migration 115: falls back to total
      expect(s.players).toBe(90);
      expect(s.counts.get('b')).toEqual({ top9: 40, first: 20 });
      expect(s.topTop9Id).toBe('a');
      expect(s.topFirstId).toBe('b');
    });

    it('reads plays from migration 115', () => {
      expect(buildStats({ total: 10, plays: '27', players: 8, members: [] }).plays).toBe(27);
    });

    it('handles no results yet', () => {
      const s = buildStats({ total: 0, players: 0, members: [] });
      expect(s.topTop9Id).toBeNull();
      expect(s.counts.size).toBe(0);
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

  it('getRanking() passes mode + limit and normalises bigint counts', async () => {
    rpc.and.resolveTo({
      data: [{ member_id: 'a', name: 'A', photo_url: null, color: null, group_name: null, top9_count: '12', first_place_count: '3' }],
      error: null,
    });
    const rows = await service.getRanking('first', 100);
    expect(rpc).toHaveBeenCalledOnceWith('get_sukigao_ranking', { p_mode: 'first', p_limit: 100 });
    expect(rows[0].top9_count).toBe(12);
    expect(rows[0].first_place_count).toBe(3);
  });
});
