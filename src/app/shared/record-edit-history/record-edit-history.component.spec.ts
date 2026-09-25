import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecordEditHistoryComponent } from './record-edit-history.component';
import { ProposalService } from '../../core/proposal.service';
import { CompanyService } from '../../core/company.service';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { Proposal } from '../../models';

const mockProposal: Proposal = {
  id: 'p1', table_name: 'members', record_id: 'm1', operation: 'UPDATE',
  proposed_data: { name: 'New' }, original_data: { name: 'Old' },
  reviewed_data: null, status: 'approved',
  submitter_id: 'u1', submitter_name: 'Alice', submitter_email: null,
  reviewer_note: null, submitter_note: null, created_at: '2026-03-01T00:00:00Z',
  reviewed_at: '2026-03-02T00:00:00Z', reviewed_by: null,
};

describe('RecordEditHistoryComponent', () => {
  let fixture: ComponentFixture<RecordEditHistoryComponent>;
  let component: RecordEditHistoryComponent;
  let proposalServiceSpy: jasmine.SpyObj<ProposalService>;

  beforeEach(async () => {
    proposalServiceSpy = jasmine.createSpyObj('ProposalService', [
      'getApprovedByRecord',
      'getApprovedHistoryByField',
      'getApprovedSongsByField',
    ]);
    proposalServiceSpy.getApprovedByRecord.and.returnValue(Promise.resolve([mockProposal]));
    proposalServiceSpy.getApprovedHistoryByField.and.returnValue(Promise.resolve([]));
    proposalServiceSpy.getApprovedSongsByField.and.returnValue(Promise.resolve([]));

    await TestBed.configureTestingModule({
      imports: [RecordEditHistoryComponent],
      providers: [
        { provide: ProposalService, useValue: proposalServiceSpy },
        { provide: CompanyService, useValue: { getAll: () => Promise.resolve([]) } },
        { provide: MemberService, useValue: { getAll: () => Promise.resolve([]) } },
        { provide: GroupService, useValue: { getAll: () => Promise.resolve([]) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecordEditHistoryComponent);
    component = fixture.componentInstance;
    component.tableName = 'members';
    component.recordId = 'm1';
    component.recordLabel = 'Alice';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load entries on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(proposalServiceSpy.getApprovedByRecord).toHaveBeenCalledWith('members', 'm1');
    expect(component.proposals.length).toBe(1);
    expect(component.loading).toBeFalse();
    expect(component.error).toBeFalse();
  });

  it('should set error=true when service throws', async () => {
    proposalServiceSpy.getApprovedByRecord.and.returnValue(Promise.reject('fail'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.error).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('should load related song proposals when configured', async () => {
    const songProposal = {
      ...mockProposal,
      id: 'song-p1',
      table_name: 'member_songs' as const,
      proposed_data: { member_id: 'm1', title: 'Song' },
      original_data: {},
    };
    proposalServiceSpy.getApprovedSongsByField.and.returnValue(Promise.resolve([songProposal]));
    component.relatedSongTable = 'member_songs';
    component.relatedSongField = 'member_id';

    fixture.detectChanges();
    await fixture.whenStable();

    expect(proposalServiceSpy.getApprovedSongsByField).toHaveBeenCalledWith('member_songs', 'member_id', 'm1');
    expect(component.proposals.some(p => p.id === 'song-p1')).toBeTrue();
  });

  describe('getSubjectLabel', () => {
    const historyProposal: Proposal = {
      ...mockProposal,
      table_name: 'history',
      proposed_data: { name_at_time: '朝陽愛央' },
      original_data: { member_id: 'm1', group_id: 'g1' },
    };

    it('returns member name for history proposals on a group page', () => {
      component.relatedHistoryField = 'group_id';
      (component as any).memberNameMap = { m1: '朝陽愛央(現名)' };
      expect(component.getSubjectLabel(historyProposal)).toBe('朝陽愛央(現名)');
    });

    it('falls back to name_at_time when member map has no entry', () => {
      component.relatedHistoryField = 'group_id';
      expect(component.getSubjectLabel(historyProposal)).toBe('朝陽愛央');
    });

    it('returns group name for history proposals on a member page', () => {
      component.relatedHistoryField = 'member_id';
      (component as any).groupNameMap = { g1: '月宵◇クレシェンテ' };
      expect(component.getSubjectLabel(historyProposal)).toBe('月宵◇クレシェンテ');
    });

    it('returns song title for song proposals', () => {
      const songProposal: Proposal = {
        ...mockProposal,
        table_name: 'group_songs',
        proposed_data: { title: 'ルミナス' },
        original_data: null,
      };
      expect(component.getSubjectLabel(songProposal)).toBe('ルミナス');
    });

    it('returns null for main-record proposals', () => {
      expect(component.getSubjectLabel(mockProposal)).toBeNull();
    });
  });
});
