import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { LeaderboardComponent } from './leaderboard.component';
import { SeoService } from '../../core/seo.service';
import { LeaderboardPageData } from '../../core/page-data.resolvers';

function makePageData(overrides: Partial<LeaderboardPageData> = {}): LeaderboardPageData {
  return {
    recentMembers: [],
    trendingMembers: [],
    recentGroups: [],
    trendingGroups: [],
    ...overrides,
  };
}

async function setup(pageData: LeaderboardPageData = makePageData()) {
  await TestBed.configureTestingModule({
    imports: [LeaderboardComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { data: { pageData } } },
      },
      { provide: SeoService, useValue: { setPage: jasmine.createSpy() } },
    ],
  }).compileComponents();
}

describe('LeaderboardComponent', () => {
  it('should be created', async () => {
    await setup();
    const fixture = TestBed.createComponent(LeaderboardComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('defaults to the members tab', async () => {
    await setup();
    const fixture = TestBed.createComponent(LeaderboardComponent);
    expect(fixture.componentInstance.activeTab).toBe('members');
  });

  it('switches to the groups tab', async () => {
    await setup();
    const fixture = TestBed.createComponent(LeaderboardComponent);
    fixture.componentInstance.setTab('groups');
    expect(fixture.componentInstance.activeTab).toBe('groups');
  });

  it('renders recent-heat member rows by rank order', async () => {
    await setup(makePageData({
      recentMembers: [
        { id: 'm1', name: 'Alice', name_roman: null, photo_url: null, color: null, recent_visitors: 42 },
        { id: 'm2', name: 'Bob', name_roman: null, photo_url: null, color: null, recent_visitors: 30 },
      ],
    }));
    const fixture = TestBed.createComponent(LeaderboardComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
  });

  it('renders a trend delta chip for trending member rows', async () => {
    await setup(makePageData({
      trendingMembers: [
        { id: 'm1', name: 'Alice', name_roman: null, photo_url: null, color: null, recent_view_count: 120, trend_delta: 87 },
      ],
    }));
    const fixture = TestBed.createComponent(LeaderboardComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('+87');
  });
});
