import { TestBed } from '@angular/core/testing';
import { GroupService } from './group.service';
import { SupabaseService } from './supabase.service';
import { Group } from '../models';

const mockGroup = {
  id: 'g-1', name: 'AKB48', name_jp: 'AKB48', color: '#e879a0',
  founded_at: '2005-12-08', disbanded_at: null,
  updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z'
} as unknown as Group;

const mockClient = {
  from: jasmine.createSpy('from').and.returnValue({
    select: jasmine.createSpy('select').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue({
        single: jasmine.createSpy('single').and.returnValue(
          Promise.resolve({ data: mockGroup, error: null })
        )
      }),
      order: jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [mockGroup], error: null })
      ),
      or: jasmine.createSpy('or').and.returnValue(
        Promise.resolve({ data: [mockGroup], error: null })
      ),
    }),
    insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null })),
    update: jasmine.createSpy('update').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
    }),
    delete: jasmine.createSpy('delete').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
    }),
  }),
  rpc: jasmine.createSpy('rpc').and.returnValue(
    Promise.resolve({
      data: [{ id: 'uuid-g1', name: 'XYZ Team', photo_url: null, color: '#e879a0', view_count: 10 }],
      error: null
    })
  )
};

describe('GroupService', () => {
  let service: GroupService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GroupService,
        { provide: SupabaseService, useValue: { client: mockClient } }
      ]
    });
    service = TestBed.inject(GroupService);
    mockClient.rpc.calls.reset();
  });

  it('should be created', () => expect(service).toBeTruthy());
  it('getById() should return a group', async () => {
    const group = await service.getById('g-1');
    expect(group).toEqual(mockGroup);
  });
  it('getAll() should return groups', async () => {
    const groups = await service.getAll();
    expect(Array.isArray(groups)).toBeTrue();
  });
  it('search() should use or()', async () => {
    const groups = await service.search('AKB');
    expect(Array.isArray(groups)).toBeTrue();
  });
  it('getTopByViews() should return leaderboard entries', async () => {
    const results = await service.getTopByViews(5);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'get_top_groups_by_views', { p_limit: 5 }
    );
    expect(results[0].name).toBe('XYZ Team');
  });
  it('getRecentPopular() should call get_recent_popular_groups with the default window', async () => {
    const results = await service.getRecentPopular(5);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'get_recent_popular_groups', { p_limit: 5, p_window_days: 7 }
    );
    expect(results[0].name).toBe('XYZ Team');
  });
  it('getTrending() should call get_trending_groups', async () => {
    const results = await service.getTrending(10);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'get_trending_groups', { p_limit: 10 }
    );
    expect(results[0].name).toBe('XYZ Team');
  });
});
