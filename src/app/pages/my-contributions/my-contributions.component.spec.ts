import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { MyContributionsComponent } from './my-contributions.component';
import { SupabaseService } from '../../core/supabase.service';
import { ProposalService } from '../../core/proposal.service';
import { Proposal } from '../../models';

const mockSession = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    user_metadata: { display_name: 'TestUser' },
  },
} as any;

const mockProposals: Partial<Proposal>[] = [
  {
    id: 'p1', table_name: 'members', operation: 'INSERT',
    proposed_data: { name: '山田花子' }, original_data: {},
    record_id: 'r1', status: 'approved', created_at: '2026-01-15T00:00:00Z',
  } as unknown as Proposal,
  {
    id: 'p2', table_name: 'history', operation: 'UPDATE',
    proposed_data: {}, original_data: { name: 'AKB48' },
    record_id: 'r2', status: 'pending', created_at: '2026-02-01T00:00:00Z',
  } as unknown as Proposal,
];

describe('MyContributionsComponent', () => {
  let component: MyContributionsComponent;
  let fixture: ComponentFixture<MyContributionsComponent>;
  let supabaseSpy: jasmine.SpyObj<SupabaseService>;
  let proposalSpy: jasmine.SpyObj<ProposalService>;

  beforeEach(async () => {
    supabaseSpy = jasmine.createSpyObj('SupabaseService', ['getSessionOnce']);
    supabaseSpy.getSessionOnce.and.returnValue(Promise.resolve(mockSession));

    proposalSpy = jasmine.createSpyObj('ProposalService', ['getMyProposals']);
    proposalSpy.getMyProposals.and.returnValue(Promise.resolve(mockProposals as Proposal[]));

    await TestBed.configureTestingModule({
      imports: [MyContributionsComponent],
      providers: [
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: ProposalService, useValue: proposalSpy },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyContributionsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => expect(component).toBeTruthy());

  it('should redirect to / when not logged in', async () => {
    supabaseSpy.getSessionOnce.and.returnValue(Promise.resolve(null));
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('should load proposals and set displayName on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.proposals.length).toBe(2);
    expect(component.displayName).toBe('TestUser');
    expect(component.loading).toBeFalse();
  });

  it('approvedCount returns count of approved proposals', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.approvedCount).toBe(1);
  });

  it('pendingCount returns count of pending proposals', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.pendingCount).toBe(1);
  });

  it('getSubject returns proposed_data.name when present', () => {
    const p = { proposed_data: { name: '花子' }, original_data: {}, record_id: 'r' } as any;
    expect(component.getSubject(p)).toBe('花子');
  });

  it('getSubject falls back to original_data.name when proposed_data.name is absent', () => {
    const p = { proposed_data: {}, original_data: { name: 'AKB48' }, record_id: 'r' } as any;
    expect(component.getSubject(p)).toBe('AKB48');
  });

  it('getSubject falls back to record_id as last resort', () => {
    const p = { proposed_data: {}, original_data: {}, record_id: 'fallback-id' } as any;
    expect(component.getSubject(p)).toBe('fallback-id');
  });

  it('getOperationLabel maps INSERT, UPDATE, DELETE', () => {
    expect(component.getOperationLabel('INSERT')).toBe('新增');
    expect(component.getOperationLabel('UPDATE')).toBe('修改');
    expect(component.getOperationLabel('DELETE')).toBe('刪除');
  });

  it('formatDate converts ISO to YYYY.MM.DD', () => {
    expect(component.formatDate('2026-01-15T00:00:00Z')).toBe('2026.01.15');
  });
});
