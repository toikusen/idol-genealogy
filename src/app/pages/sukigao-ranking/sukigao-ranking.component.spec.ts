import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SukigaoRankingComponent } from './sukigao-ranking.component';
import { SukigaoService } from '../../core/sukigao.service';
import { SeoService } from '../../core/seo.service';
import { SukigaoRankingEntry, SukigaoRankingMode, SukigaoStats } from '../../models';

function entries(n: number, mode: SukigaoRankingMode): SukigaoRankingEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    member_id: `m${i}`,
    name: `成員${i}`,
    photo_url: null,
    color: null,
    group_name: '團',
    top9_count: mode === 'top9' ? 400 - i * 3 : 50,
    first_place_count: mode === 'first' ? 120 - i : 5,
  }));
}

describe('SukigaoRankingComponent', () => {
  let fixture: ComponentFixture<SukigaoRankingComponent>;
  let sukigao: jasmine.SpyObj<SukigaoService>;

  async function setup(stats: SukigaoStats | Error, n = 100) {
    sukigao = jasmine.createSpyObj<SukigaoService>('SukigaoService', ['getRanking', 'getStats']);
    sukigao.getRanking.and.callFake((mode: SukigaoRankingMode) => Promise.resolve(entries(n, mode)));
    if (stats instanceof Error) sukigao.getStats.and.rejectWith(stats);
    else sukigao.getStats.and.resolveTo(stats);
    await TestBed.configureTestingModule({
      imports: [SukigaoRankingComponent],
      providers: [
        provideRouter([]),
        { provide: SukigaoService, useValue: sukigao },
        { provide: SeoService, useValue: { setPage: () => {} } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SukigaoRankingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const stats: SukigaoStats = { total: 1000, plays: 1500, players: 800, counts: new Map(), topTop9Id: null, topFirstId: null };

  it('shows the play count, a podium of 3 and places 4–10 as percentages', async () => {
    await setup(stats);
    const el: HTMLElement = fixture.nativeElement;
    // Headline counts games (replays included); percentages use the 1,000 results.
    expect(el.textContent).toContain('1,500次顏控9選');
    expect(el.textContent).toContain('800位玩家參與');
    expect(el.querySelectorAll('.skrank-pod').length).toBe(3);
    expect(el.querySelector('.skrank-pod--1 .skrank-pod__value')!.textContent).toBe('40%');
    expect(el.querySelectorAll('.skrank-list .skrank-row').length).toBe(7);
    expect(el.textContent).toContain('把她選進 TOP9 的人比例');
    expect(el.textContent).toContain('看更多（第 11–30 名）');
  });

  it('TOP9 tab lists at most 50, 20 more per tap', async () => {
    await setup(stats);
    const el: HTMLElement = fixture.nativeElement;
    for (let i = 0; i < 3; i++) {
      (el.querySelector('.skrank-more') as HTMLButtonElement | null)?.click();
      fixture.detectChanges();
    }
    expect(el.querySelectorAll('.skrank-list .skrank-row').length).toBe(47);
    expect(el.querySelector('.skrank-more')).toBeNull();
    expect(el.textContent).toContain('僅列出前 50 名');
  });

  it('first-place tab lists at most 30 and leaves out members under 1%', async () => {
    // 1000 results: first_place_count 120 - i → under 1% (10) from i = 111 on; the cap of 30 hits first.
    await setup(stats);
    fixture.componentInstance.selectTab('first');
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.visible().length).toBe(30);
    // With few results each #1 pick is a big share; with many, the long tail drops out.
    c.stats.set({ ...stats, total: 10000 });
    fixture.detectChanges();
    // 120 - i >= 100 (1% of 10,000) → i <= 20 → 21 members.
    expect(c.visible().length).toBe(21);
    // The note shows under the list once 看更多 has revealed everything.
    expect(c.endNote()).toBe('其餘不到 1% 的成員未列出');
    c.showMore();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.skrank-more')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('其餘不到 1% 的成員未列出');
  });

  it('first-place tab uses first-place counts and starts collapsed again', async () => {
    await setup(stats);
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('.skrank-more') as HTMLButtonElement).click();
    fixture.componentInstance.selectTab('first');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(sukigao.getRanking).toHaveBeenCalledWith('first', 100);
    expect(el.querySelector('.skrank-pod--1 .skrank-pod__value')!.textContent).toBe('12%');
    expect(el.textContent).toContain('把她選為心中第一的人比例');
    expect(el.querySelectorAll('.skrank-list .skrank-row').length).toBe(7);
  });

  it('falls back to counts when the stats are unavailable', async () => {
    await setup(new Error('502'));
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.skrank-stats')).toBeNull();
    expect(el.querySelector('.skrank-pod--1 .skrank-pod__value')!.textContent).toBe('400 次');
    expect(el.textContent).toContain('把她選進 TOP9 的人次數');
  });

  it('ties share a place', async () => {
    await setup(stats, 5);
    const c = fixture.componentInstance;
    c.entries.set(entries(5, 'top9').map((e, i) => ({ ...e, top9_count: [9, 7, 7, 5, 5][i] })));
    expect([0, 1, 2, 3, 4].map(i => c.place(i))).toEqual([1, 2, 2, 4, 4]);
  });
});
