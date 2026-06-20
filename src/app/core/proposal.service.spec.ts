import { TestBed } from '@angular/core/testing';
import { ProposalService } from './proposal.service';
import { SupabaseService } from './supabase.service';

describe('ProposalService', () => {
  let service: ProposalService;
  let mockDb: any;
  let insertSpy: jasmine.Spy;

  beforeEach(() => {
    insertSpy = jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null }));

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
    it('should insert an approved UPDATE proposal for changed fields', async () => {
      await service.recordDirectEdit(
        'members', 'rec-1',
        { name: 'Old', photo_status: null },
        { name: 'New', photo_status: 'allowed' },
      );
      expect(insertSpy).toHaveBeenCalled();
      const payload = insertSpy.calls.mostRecent().args[0];
      expect(payload.operation).toBe('UPDATE');
      expect(payload.status).toBe('approved');
      expect(payload.submitter_name).toBe('管理員');
      expect(payload.proposed_data['name']).toBe('New');
      expect(payload.proposed_data['photo_status']).toBe('allowed');
      expect(payload.original_data['name']).toBe('Old');
    });

    it('should not insert when no allowed fields changed', async () => {
      await service.recordDirectEdit(
        'members', 'rec-1',
        { name: 'Same' },
        { name: 'Same' },
      );
      expect(insertSpy).not.toHaveBeenCalled();
    });

    it('should include member_id and group_id anchors in history UPDATE even when unchanged', async () => {
      await service.recordDirectEdit(
        'history', 'hist-1',
        { member_id: 'm-uuid', group_id: 'g-uuid', status: 'active' },
        { member_id: 'm-uuid', group_id: 'g-uuid', status: 'graduated' },
      );
      expect(insertSpy).toHaveBeenCalled();
      const payload = insertSpy.calls.mostRecent().args[0];
      expect(payload.proposed_data['member_id']).toBe('m-uuid');
      expect(payload.proposed_data['group_id']).toBe('g-uuid');
      expect(payload.original_data['member_id']).toBe('m-uuid');
      expect(payload.original_data['group_id']).toBe('g-uuid');
      expect(payload.proposed_data['status']).toBe('graduated');
    });

    it('should insert an INSERT proposal with non-null allowed fields', async () => {
      await service.recordDirectEdit(
        'members', 'new-rec',
        {},
        { name: 'NewMember', photo_status: 'allowed', color: null },
        'INSERT',
      );
      expect(insertSpy).toHaveBeenCalled();
      const payload = insertSpy.calls.mostRecent().args[0];
      expect(payload.operation).toBe('INSERT');
      expect(payload.proposed_data['name']).toBe('NewMember');
      expect(payload.proposed_data['photo_status']).toBe('allowed');
      expect(payload.proposed_data['color']).toBeUndefined();
    });

    it('should include owner anchor fields for song INSERT proposals', async () => {
      await service.recordDirectEdit(
        'member_songs', 'song-1',
        {},
        { member_id: 'member-1', title: 'Song title' },
        'INSERT',
      );
      expect(insertSpy).toHaveBeenCalled();
      const payload = insertSpy.calls.mostRecent().args[0];
      expect(payload.proposed_data['member_id']).toBe('member-1');
      expect(payload.proposed_data['title']).toBe('Song title');
    });

    it('should insert a DELETE proposal with original song data and owner anchor', async () => {
      await service.recordDirectEdit(
        'group_songs', 'song-2',
        { group_id: 'group-1', title: 'Old song' },
        {},
        'DELETE',
      );
      expect(insertSpy).toHaveBeenCalled();
      const payload = insertSpy.calls.mostRecent().args[0];
      expect(payload.operation).toBe('DELETE');
      expect(payload.original_data['group_id']).toBe('group-1');
      expect(payload.original_data['title']).toBe('Old song');
      expect(payload.proposed_data['group_id']).toBe('group-1');
    });

    it('should not insert an INSERT proposal when no allowed fields are non-null', async () => {
      await service.recordDirectEdit(
        'members', 'new-rec',
        {},
        { color: null, notes: null },
        'INSERT',
      );
      expect(insertSpy).not.toHaveBeenCalled();
    });
  });
});
