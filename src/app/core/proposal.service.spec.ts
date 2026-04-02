import { TestBed } from '@angular/core/testing';
import { ProposalService } from './proposal.service';
import { SupabaseService } from './supabase.service';

describe('ProposalService', () => {
  let service: ProposalService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      from: jasmine.createSpy('from').and.returnValue({
        insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null })),
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
          }),
          order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
        }),
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
        }),
      })
    };
    TestBed.configureTestingModule({
      providers: [
        ProposalService,
        { provide: SupabaseService, useValue: { client: mockDb, getSessionOnce: () => Promise.resolve(null) } }
      ]
    });
    service = TestBed.inject(ProposalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('submit() should call from(proposals).insert()', async () => {
    await service.submit({
      table_name: 'members',
      record_id: 'uuid-123',
      operation: 'UPDATE',
      proposed_data: { name: 'Test' },
      original_data: { name: 'Old' },
      submitter_name: 'Tester',
      submitter_id: null,
      submitter_email: null,
      submitter_note: null,
    });
    expect(mockDb.from).toHaveBeenCalledWith('proposals');
  });

  it('getPendingCount() should return 0 for empty result', async () => {
    mockDb.from.and.returnValue({
      select: jasmine.createSpy('select').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ data: [], error: null }))
      })
    });
    const count = await service.getPendingCount();
    expect(count).toBe(0);
  });

  describe('getApprovedByRecord', () => {
    it('should call rpc with correct params and return proposals', async () => {
      mockDb.rpc = jasmine.createSpy('rpc').and.returnValue(
        Promise.resolve({ data: [{ id: 'p1', table_name: 'members' }], error: null })
      );
      const result = await service.getApprovedByRecord('members', 'uuid-abc');
      expect(mockDb.rpc).toHaveBeenCalledWith('get_approved_by_record', {
        p_table_name: 'members',
        p_record_id: 'uuid-abc',
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('p1');
    });

    it('should throw if rpc returns error', async () => {
      mockDb.rpc = jasmine.createSpy('rpc').and.returnValue(
        Promise.resolve({ data: null, error: { message: 'rpc error' } })
      );
      await expectAsync(service.getApprovedByRecord('members', 'x')).toBeRejected();
    });
  });

  describe('getLeaderboard', () => {
    it('should call get_leaderboard rpc and return entries', async () => {
      mockDb.rpc = jasmine.createSpy('rpc').and.returnValue(
        Promise.resolve({
          data: [{ submitter_id: 'u1', submitter_name: 'Alice', total: 5, by_table: { members: 5 } }],
          error: null,
        })
      );
      const result = await service.getLeaderboard();
      expect(mockDb.rpc).toHaveBeenCalledWith('get_leaderboard');
      expect(result.length).toBe(1);
      expect(result[0].total).toBe(5);
    });
  });
});
