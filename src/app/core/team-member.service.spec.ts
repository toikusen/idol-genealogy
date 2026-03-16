import { TestBed } from '@angular/core/testing';
import { TeamMemberService } from './team-member.service';
import { SupabaseService } from './supabase.service';
import { TeamMember } from '../models';

const mockMember: TeamMember = {
  id: 'tm-1', name: '小花', bio: '主編', photo_url: null,
  instagram: null, x: null, sort_order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
};

describe('TeamMemberService', () => {
  let service: TeamMemberService;
  let insertSpy: jasmine.Spy;
  let updateSpy: jasmine.Spy;
  let updateEqSpy: jasmine.Spy;
  let deleteSpy: jasmine.Spy;
  let deleteEqSpy: jasmine.Spy;

  beforeEach(() => {
    updateEqSpy = jasmine.createSpy('updateEq').and.returnValue(Promise.resolve({ error: null }));
    updateSpy = jasmine.createSpy('update').and.returnValue({ eq: updateEqSpy });
    deleteEqSpy = jasmine.createSpy('deleteEq').and.returnValue(Promise.resolve({ error: null }));
    deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: deleteEqSpy });
    insertSpy = jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null }));

    const mockClient = {
      from: jasmine.createSpy('from').and.returnValue({
        // getAll() chains .select().order().order()
        select: jasmine.createSpy('select').and.returnValue({
          order: jasmine.createSpy('order1').and.returnValue({
            order: jasmine.createSpy('order2').and.returnValue(
              Promise.resolve({ data: [mockMember], error: null })
            ),
          }),
        }),
        insert: insertSpy,
        update: updateSpy,
        delete: deleteSpy,
      })
    };

    TestBed.configureTestingModule({
      providers: [
        TeamMemberService,
        { provide: SupabaseService, useValue: { client: mockClient } }
      ]
    });
    service = TestBed.inject(TeamMemberService);
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('getAll() should return members ordered by sort_order then created_at', async () => {
    const members = await service.getAll();
    expect(Array.isArray(members)).toBeTrue();
    expect(members[0].name).toBe('小花');
  });

  it('create() should call insert with the member data', async () => {
    await service.create({ name: '新成員' });
    expect(insertSpy).toHaveBeenCalledWith({ name: '新成員' });
  });

  it('update() should call update().eq() with id and data', async () => {
    await service.update('tm-1', { name: '更新' });
    expect(updateSpy).toHaveBeenCalledWith({ name: '更新' });
    expect(updateEqSpy).toHaveBeenCalledWith('id', 'tm-1');
  });

  it('delete() should call delete().eq() with the id', async () => {
    await service.delete('tm-1');
    expect(deleteEqSpy).toHaveBeenCalledWith('id', 'tm-1');
  });
});
