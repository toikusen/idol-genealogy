import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ContributorsComponent } from './contributors.component';
import { ProposalService, ContributorEntry } from '../../core/proposal.service';
import { SupabaseService } from '../../core/supabase.service';

const mockEntries: ContributorEntry[] = [
  { submitter_id: 'u1', submitter_name: 'Alice', total: 34, by_table: { members: 22, groups: 8, companies: 4 } },
  { submitter_id: 'u2', submitter_name: 'Bob',   total: 18, by_table: { members: 14, groups: 4 } },
  { submitter_id: 'u3', submitter_name: 'Carol', total: 12, by_table: { members: 10, companies: 2 } },
  { submitter_id: 'u4', submitter_name: 'Dave',  total: 5,  by_table: { members: 5 } },
];

describe('ContributorsComponent', () => {
  let fixture: ComponentFixture<ContributorsComponent>;
  let component: ContributorsComponent;
  let proposalServiceSpy: jasmine.SpyObj<ProposalService>;
  let supabaseSpy: jasmine.SpyObj<SupabaseService>;

  beforeEach(async () => {
    proposalServiceSpy = jasmine.createSpyObj('ProposalService', ['getLeaderboard']);
    proposalServiceSpy.getLeaderboard.and.returnValue(Promise.resolve(mockEntries));

    supabaseSpy = jasmine.createSpyObj('SupabaseService', ['getSessionOnce']);
    supabaseSpy.getSessionOnce.and.returnValue(Promise.resolve(null));

    await TestBed.configureTestingModule({
      imports: [ContributorsComponent],
      providers: [
        { provide: ProposalService, useValue: proposalServiceSpy },
        { provide: SupabaseService, useValue: supabaseSpy },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ContributorsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => expect(component).toBeTruthy());

  it('should load leaderboard on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(proposalServiceSpy.getLeaderboard).toHaveBeenCalled();
    expect(component.leaderboard.length).toBe(4);
    expect(component.loading).toBeFalse();
  });

  it('top3 returns first 3 entries', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.top3.length).toBe(3);
    expect(component.top3[0].submitter_name).toBe('Alice');
  });

  it('rest returns entries from index 3 onward', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.rest.length).toBe(1);
    expect(component.rest[0].submitter_name).toBe('Dave');
  });

  it('getByTableLabel omits zero-count tables', () => {
    const label = component.getByTableLabel({ members: 5, groups: 0 });
    expect(label).not.toContain('組合');
    expect(label).toContain('成員 5');
  });

  it('getBadgeForEntry returns correct badge based on total', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    // Alice has 34 approved → 貢獻者 (threshold 30)
    expect(component.getBadgeForEntry(mockEntries[0])?.name).toBe('貢獻者');
    // Dave has 5 approved → 新芽 (threshold 1)
    expect(component.getBadgeForEntry(mockEntries[3])?.name).toBe('新芽');
  });

  it('currentUserId is null when not logged in', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.currentUserId).toBeNull();
  });

  it('currentUserId is set from session when logged in', async () => {
    supabaseSpy.getSessionOnce.and.returnValue(
      Promise.resolve({ user: { id: 'u1' } } as any)
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.currentUserId).toBe('u1');
  });
});
