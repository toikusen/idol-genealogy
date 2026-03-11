import { TestBed } from '@angular/core/testing';
import { GroupService } from './group.service';
import { SupabaseService } from './supabase.service';
import { Group } from '../models';

const mockGroup: Group = {
  id: 'g-1', name: 'AKB48', name_jp: 'AKB48', color: '#e879a0',
  founded_at: '2005-12-08', disbanded_at: null,
  updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z'
};

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
  })
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
});
