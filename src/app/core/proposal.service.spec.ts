import { TestBed } from '@angular/core/testing';
import { ProposalService } from './proposal.service';
import { SupabaseService } from './supabase.service';

describe('ProposalService', () => {
  let service: ProposalService;
  let mockDb: any;
  let insertSpy: jasmine.Spy;
  let rpcSpy: jasmine.Spy;

  beforeEach(() => {
    insertSpy = jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null }));
    rpcSpy = jasmine.createSpy('rpc').and.returnValue(Promise.resolve({ error: null }));

    const createSelectChain = () => {
      const isChain = {
        gte: jasmine.createSpy('gte').and.returnValue(Promise.resolve({ count: 0, error: null }))
      };
      const eqChain = {
        is: jasmine.createSpy('is').and.returnValue(isChain),
        order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
      };
      return { eq: jasmine.createSpy('eq').and.returnValue(eqChain) };
    };

    mockDb = {
      from: jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'proposals') {
          return {
            insert: insertSpy,
            select: jasmine.createSpy('select').and.returnValue(createSelectChain()),
            update: jasmine.createSpy('update').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
            }),
          };
        }
        return { select: jasmine.createSpy('select').and.returnValue(createSelectChain()) };
      }),
      rpc: rpcSpy,
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
    const count = await service.getPendingCount();
    expect(count).toBe(0);
  });

  describe('submit() anonymous rate limit', () => {
    const anonymousProposal = {
      table_name: 'members' as const,
      record_id: 'uuid-123',
      operation: 'UPDATE' as const,
      proposed_data: { name: 'Test' },
      original_data: { name: 'Old' },
      submitter_name: 'Tester',
      submitter_id: null,
      submitter_email: null,
      submitter_note: null,
    };

    function mockRateLimitResult(result: { count?: number | null; error?: any }) {
      mockDb.from = jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'proposals') {
          return {
            insert: insertSpy,
            select: jasmine.createSpy('select').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue({
                is: jasmine.createSpy('is').and.returnValue({
                  gte: jasmine.createSpy('gte').and.returnValue(Promise.resolve(result)),
                }),
              }),
            }),
          };
        }
        return {};
      });
    }

    it('throws a rate-limit error when count >= 5', async () => {
      mockRateLimitResult({ count: 5, error: null });
      await expectAsync(service.submit(anonymousProposal)).toBeRejectedWithError('送出過於頻繁，請稍後再試');
      expect(insertSpy).not.toHaveBeenCalled();
    });

    it('fails closed and throws when the rate-limit query errors', async () => {
      mockRateLimitResult({ count: undefined, error: { message: 'db error' } });
      await expectAsync(service.submit(anonymousProposal)).toBeRejectedWithError('目前無法送出，請稍後再試');
      expect(insertSpy).not.toHaveBeenCalled();
    });

    it('calls insert when count < 5', async () => {
      mockRateLimitResult({ count: 2, error: null });
      await service.submit(anonymousProposal);
      expect(insertSpy).toHaveBeenCalledWith(anonymousProposal);
    });
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

  describe('getApprovedSongsByField', () => {
    it('should call rpc with correct params and return proposals', async () => {
      mockDb.rpc = jasmine.createSpy('rpc').and.returnValue(
        Promise.resolve({ data: [{ id: 'song-p1', table_name: 'member_songs' }], error: null })
      );
      const result = await service.getApprovedSongsByField('member_songs', 'member_id', 'member-abc');
      expect(mockDb.rpc).toHaveBeenCalledWith('get_approved_songs_by_field', {
        p_table_name: 'member_songs',
        p_field: 'member_id',
        p_value: 'member-abc',
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('song-p1');
    });
  });

  describe('recordDirectEdit', () => {
    it('should record an approved UPDATE proposal for changed fields', async () => {
      await service.recordDirectEdit(
        'members', 'rec-1',
        { name: 'Old', photo_status: null },
        { name: 'New', photo_status: 'allowed' },
      );
      expect(rpcSpy).toHaveBeenCalled();
      const [fn, params] = rpcSpy.calls.mostRecent().args;
      expect(fn).toBe('insert_approved_proposal');
      expect(params.p_table_name).toBe('members');
      expect(params.p_record_id).toBe('rec-1');
      expect(params.p_operation).toBe('UPDATE');
      expect(params.p_proposed_data['name']).toBe('New');
      expect(params.p_proposed_data['photo_status']).toBe('allowed');
      expect(params.p_original_data['name']).toBe('Old');
    });

    it('should not record when no allowed fields changed', async () => {
      await service.recordDirectEdit(
        'members', 'rec-1',
        { name: 'Same' },
        { name: 'Same' },
      );
      expect(rpcSpy).not.toHaveBeenCalled();
    });

    it('should include member_id and group_id anchors in history UPDATE even when unchanged', async () => {
      await service.recordDirectEdit(
        'history', 'hist-1',
        { member_id: 'm-uuid', group_id: 'g-uuid', status: 'active' },
        { member_id: 'm-uuid', group_id: 'g-uuid', status: 'graduated' },
      );
      expect(rpcSpy).toHaveBeenCalled();
      const params = rpcSpy.calls.mostRecent().args[1];
      expect(params.p_proposed_data['member_id']).toBe('m-uuid');
      expect(params.p_proposed_data['group_id']).toBe('g-uuid');
      expect(params.p_original_data['member_id']).toBe('m-uuid');
      expect(params.p_original_data['group_id']).toBe('g-uuid');
      expect(params.p_proposed_data['status']).toBe('graduated');
    });

    it('should record an INSERT proposal with non-null allowed fields', async () => {
      await service.recordDirectEdit(
        'members', 'new-rec',
        {},
        { name: 'NewMember', photo_status: 'allowed', color: null },
        'INSERT',
      );
      expect(rpcSpy).toHaveBeenCalled();
      const params = rpcSpy.calls.mostRecent().args[1];
      expect(params.p_operation).toBe('INSERT');
      expect(params.p_proposed_data['name']).toBe('NewMember');
      expect(params.p_proposed_data['photo_status']).toBe('allowed');
      expect(params.p_proposed_data['color']).toBeUndefined();
    });

    it('should include owner anchor fields for song INSERT proposals', async () => {
      await service.recordDirectEdit(
        'member_songs', 'song-1',
        {},
        { member_id: 'member-1', title: 'Song title' },
        'INSERT',
      );
      expect(rpcSpy).toHaveBeenCalled();
      const params = rpcSpy.calls.mostRecent().args[1];
      expect(params.p_proposed_data['member_id']).toBe('member-1');
      expect(params.p_proposed_data['title']).toBe('Song title');
    });

    it('should record a DELETE proposal with original song data and owner anchor', async () => {
      await service.recordDirectEdit(
        'group_songs', 'song-2',
        { group_id: 'group-1', title: 'Old song' },
        {},
        'DELETE',
      );
      expect(rpcSpy).toHaveBeenCalled();
      const params = rpcSpy.calls.mostRecent().args[1];
      expect(params.p_operation).toBe('DELETE');
      expect(params.p_original_data['group_id']).toBe('group-1');
      expect(params.p_original_data['title']).toBe('Old song');
      expect(params.p_proposed_data['group_id']).toBe('group-1');
    });

    it('should not record an INSERT proposal when no allowed fields are non-null', async () => {
      await service.recordDirectEdit(
        'members', 'new-rec',
        {},
        { color: null, notes: null },
        'INSERT',
      );
      expect(rpcSpy).not.toHaveBeenCalled();
    });
  });
});
