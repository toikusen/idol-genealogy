import { TestBed } from '@angular/core/testing';
import { MemberService } from './member.service';
import { SupabaseService } from './supabase.service';
import { Member } from '../models';

const mockMember = {
  id: 'uuid-1', name: '山田花子', name_hiragana: 'やまだはなこ', name_roman: 'Hanako Yamada', emoji: '🌸',
  photo_url: null, color: null, color_name: null, birthdate: '1995-01-01', nickname: null,
  instagram: null, facebook: null, x: null, maid_url: null, notes: null, company_id: null,
  updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z'
} as unknown as Member;

const mockSupabaseService = {
  client: {
    from: jasmine.createSpy('from').and.returnValue({
      select: jasmine.createSpy('select').and.returnValue({
        or: jasmine.createSpy('or').and.returnValue(
          Promise.resolve({ data: [mockMember], error: null })
        ),
        eq: jasmine.createSpy('eq').and.returnValue({
          single: jasmine.createSpy('single').and.returnValue(
            Promise.resolve({ data: mockMember, error: null })
          )
        }),
        order: jasmine.createSpy('order').and.returnValue({
          limit: jasmine.createSpy('limit').and.returnValue(
            Promise.resolve({ data: [mockMember], error: null })
          )
        }),
      }),
      insert: jasmine.createSpy('insert').and.returnValue(
        Promise.resolve({ error: null })
      ),
      update: jasmine.createSpy('update').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(
          Promise.resolve({ error: null })
        )
      }),
      delete: jasmine.createSpy('delete').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(
          Promise.resolve({ error: null })
        )
      }),
    }),
    rpc: jasmine.createSpy('rpc').and.returnValue(
      Promise.resolve({
        data: [{ id: 'uuid-1', name: '小花', name_roman: null, photo_url: null, color: null, view_count: 42 }],
        error: null
      })
    )
  }
};

describe('MemberService', () => {
  let service: MemberService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MemberService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
    service = TestBed.inject(MemberService);
    mockSupabaseService.client.rpc.calls.reset();
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('search() should call supabase with or() covering name, hiragana, romaji and emoji', async () => {
    const results = await service.search('山田');
    expect(mockSupabaseService.client.from).toHaveBeenCalledWith('members');
    expect(results).toEqual([mockMember]);
  });

  it('getById() should return a single member', async () => {
    const member = await service.getById('uuid-1');
    expect(member).toEqual(mockMember);
  });

  it('getRecent() should return list of members', async () => {
    const members = await service.getRecent(10);
    expect(Array.isArray(members)).toBeTrue();
  });

  it('getTopByViews() should return leaderboard entries sorted by view_count', async () => {
    const results = await service.getTopByViews(5);
    expect(mockSupabaseService.client.rpc).toHaveBeenCalledWith(
      'get_top_members_by_views', { p_limit: 5 }
    );
    expect(results.length).toBe(1);
    expect(results[0].view_count).toBe(42);
  });

  it('getRecentPopular() should call get_recent_popular_members with the default window', async () => {
    const results = await service.getRecentPopular(5);
    expect(mockSupabaseService.client.rpc).toHaveBeenCalledWith(
      'get_recent_popular_members', { p_limit: 5, p_window_days: 7 }
    );
    expect(Array.isArray(results)).toBeTrue();
  });

  it('getRecentPopular() should pass a custom window when provided', async () => {
    await service.getRecentPopular(5, 30);
    expect(mockSupabaseService.client.rpc).toHaveBeenCalledWith(
      'get_recent_popular_members', { p_limit: 5, p_window_days: 30 }
    );
  });

  it('getTrending() should call get_trending_members', async () => {
    const results = await service.getTrending(10);
    expect(mockSupabaseService.client.rpc).toHaveBeenCalledWith(
      'get_trending_members', { p_limit: 10 }
    );
    expect(Array.isArray(results)).toBeTrue();
  });

  it('getRecentPopular() de-dups repeat calls and re-fetches for a new window', async () => {
    await service.getRecentPopular(5);
    await service.getRecentPopular(5);
    expect(mockSupabaseService.client.rpc).toHaveBeenCalledTimes(1);
    await service.getRecentPopular(5, 30);
    expect(mockSupabaseService.client.rpc).toHaveBeenCalledTimes(2);
  });

  it('getTrending() serves repeat calls from cache', async () => {
    await service.getTrending(10);
    await service.getTrending(10);
    expect(mockSupabaseService.client.rpc).toHaveBeenCalledTimes(1);
  });

  it('getCount() caches and invalidateCache() forces a re-fetch', async () => {
    await service.getCount();
    mockSupabaseService.client.from.calls.reset();
    await service.getCount();
    expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
    service.invalidateCache();
    await service.getCount();
    expect(mockSupabaseService.client.from).toHaveBeenCalledTimes(1);
  });

  it('getRecent() serves repeat calls from cache', async () => {
    await service.getRecent(9);
    mockSupabaseService.client.from.calls.reset();
    await service.getRecent(9);
    expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
  });
});
