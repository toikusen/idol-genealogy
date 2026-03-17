import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecordEditHistoryComponent } from './record-edit-history.component';
import { ProposalService } from '../../core/proposal.service';
import { Proposal } from '../../models';

const mockProposal: Proposal = {
  id: 'p1', table_name: 'members', record_id: 'm1', operation: 'UPDATE',
  proposed_data: { name: 'New' }, original_data: { name: 'Old' },
  reviewed_data: null, status: 'approved',
  submitter_id: 'u1', submitter_name: 'Alice', submitter_email: null,
  reviewer_note: null, created_at: '2026-03-01T00:00:00Z',
  reviewed_at: '2026-03-02T00:00:00Z', reviewed_by: null,
};

describe('RecordEditHistoryComponent', () => {
  let fixture: ComponentFixture<RecordEditHistoryComponent>;
  let component: RecordEditHistoryComponent;
  let proposalServiceSpy: jasmine.SpyObj<ProposalService>;

  beforeEach(async () => {
    proposalServiceSpy = jasmine.createSpyObj('ProposalService', ['getApprovedByRecord']);
    proposalServiceSpy.getApprovedByRecord.and.returnValue(Promise.resolve([mockProposal]));

    await TestBed.configureTestingModule({
      imports: [RecordEditHistoryComponent],
      providers: [{ provide: ProposalService, useValue: proposalServiceSpy }],
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

  it('should load proposals on init', async () => {
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
});
