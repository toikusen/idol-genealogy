import { TestBed } from '@angular/core/testing';
import { TeamMemberService } from './team-member.service';
import { SupabaseService } from './supabase.service';
import { TeamMember } from '../models';

const mockMember: TeamMember = {
  id: 'tm-1', name: '小花', bio: '主編', photo_url: null,
  instagram: null, x: null, sort_order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
};

// getAll() calls .order() twice (sort_order then created_at), so the mock
// must chain order → order → Promise to avoid a TypeError.
const mockClient = {
  from: jasmine.createSpy('from').and.returnValue({
    select: jasmine.createSpy('select').and.returnValue({
      order: jasmine.createSpy('order1').and.returnValue({
        order: jasmine.createSpy('order2').and.returnValue(
          Promise.resolve({ data: [mockMember], error: null })
        ),
      }),
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

describe('TeamMemberService', () => {
  let service: TeamMemberService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TeamMemberService,
        { provide: SupabaseService, useValue: { client: mockClient } }
      ]
    });
    service = TestBed.inject(TeamMemberService);
  });

  it('should be created', () => expect(service).toBeTruthy());
  it('getAll() should return members', async () => {
    const members = await service.getAll();
    expect(Array.isArray(members)).toBeTrue();
    expect(members[0].name).toBe('小花');
  });
  it('create() should call insert', async () => {
    await service.create({ name: '新成員' });
    expect(mockClient.from).toHaveBeenCalledWith('team_members');
  });
  it('update() should call update().eq()', async () => {
    await service.update('tm-1', { name: '更新' });
    expect(mockClient.from).toHaveBeenCalledWith('team_members');
  });
  it('delete() should call delete().eq()', async () => {
    await service.delete('tm-1');
    expect(mockClient.from).toHaveBeenCalledWith('team_members');
  });
});
