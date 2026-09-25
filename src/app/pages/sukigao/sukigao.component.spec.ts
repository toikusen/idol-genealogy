import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SukigaoComponent } from './sukigao.component';
import { SukigaoPool, SukigaoService } from '../../core/sukigao.service';
import { SUKIGAO_STATE_KEY, SukigaoSessionService } from '../../core/sukigao-session.service';
import { AnalyticsService } from '../../core/analytics.service';
import { SukigaoCandidate } from '../../models';
import { buildShareText, buildXShareUrl } from './sukigao-result.component';

function candidates(n: number): SukigaoCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${String(i).padStart(3, '0')}`,
    name: `成員${i}`,
    photoUrl: '',
    groupNames: [`團${i % 5}`],
    color: null,
  }));
}

describe('SukigaoComponent', () => {
  let fixture: ComponentFixture<SukigaoComponent>;
  let component: SukigaoComponent;
  let sukigao: jasmine.SpyObj<SukigaoService>;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  const pool = (n: number): SukigaoPool => ({ candidates: candidates(n), version: `${n}:v`, groupCount: 5 });

  async function setup(n = 48) {
    sukigao = jasmine.createSpyObj<SukigaoService>('SukigaoService', ['getPool', 'getMembersByIds', 'submit', 'getRanking']);
    sukigao.getPool.and.resolveTo(pool(n));
    sukigao.getMembersByIds.and.resolveTo([]);
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['trackEvent', 'trackPageView']);
    await TestBed.configureTestingModule({
      imports: [SukigaoComponent],
      providers: [
        provideRouter([]),
        SukigaoSessionService,
        { provide: SukigaoService, useValue: sukigao },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SukigaoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.load();
    fixture.detectChanges();
  }

  /** Picks the first 3 of every batch and plays the final picking the left card. */
  function playToResult() {
    component.start();
    while (component.stage() === 'preliminary') {
      component.batch().slice(0, 3).forEach(face => component.togglePick(face.id));
      component.nextBatch();
    }
    let guard = 0;
    while (component.stage() === 'final' && guard++ < 200) {
      component.chooseFinal(component.pair()[0].id);
    }
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('shows the intro with DB-driven counts', async () => {
    await setup(48);
    expect(component.view()).toBe('intro');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('5 團體・48 位成員');
    expect(text).toContain('開始選我的顏控9選');
  });

  it('renders at most one batch of 12 cards in the preliminary', async () => {
    await setup(400);
    component.start();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-sukigao-card').length).toBe(12);
    expect(analytics.trackEvent).toHaveBeenCalledWith('sukigao_start', jasmine.any(Object));
  });

  it('persists progress and resumes it after a reload', async () => {
    await setup(48);
    component.start();
    const first = component.batch()[0].id;
    component.togglePick(first);
    component.nextBatch();
    const order = component.game()!.candidateIds;

    fixture.destroy();
    TestBed.resetTestingModule();
    await setup(48);
    // Every visit lands on the intro, offering to continue.
    expect(component.view()).toBe('intro');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('繼續上次的進度（海選 2 / 4）');
    component.resume();
    expect(component.view()).toBe('game');
    expect(component.game()!.candidateIds).toEqual(order);
    expect(component.game()!.batchIndex).toBe(1);
    expect(component.game()!.batchPicks[0]).toEqual([first]);
  });

  it('hides the floating app chrome only while a round is on screen', async () => {
    await setup(48);
    expect(document.body.classList.contains('sukigao-immersive')).toBeFalse();
    component.start();
    fixture.detectChanges();
    expect(document.body.classList.contains('sukigao-immersive')).toBeTrue();
    component.backToIntro();
    fixture.detectChanges();
    expect(document.body.classList.contains('sukigao-immersive')).toBeFalse();
    expect(component.game()).not.toBeNull();
  });

  it('asks before a new game overwrites saved progress', async () => {
    await setup(48);
    component.start();
    const first = component.game()!.sessionId;
    component.backToIntro();
    spyOn(window, 'confirm').and.returnValue(false);
    component.start();
    expect(component.game()!.sessionId).toBe(first);
  });

  it('shows the load error with a retry', async () => {
    await setup(48);
    sukigao.getPool.and.rejectWith(new Error('offline'));
    await component.load();
    fixture.detectChanges();
    expect(component.view()).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('名單載入失敗');
  });

  it('refuses to start with fewer than 9 candidates', async () => {
    await setup(5);
    expect(component.view()).toBe('too-few');
  });

  it('plays through to a TOP 9 result', async () => {
    await setup(48);
    playToResult();
    fixture.detectChanges();
    expect(component.stage()).toBe('result');
    expect(component.resultFaces().length).toBe(9);
    expect(analytics.trackEvent).toHaveBeenCalledWith('sukigao_complete', jasmine.any(Object));
  });

  it('never sends member preferences to analytics', async () => {
    await setup(48);
    playToResult();
    for (const call of analytics.trackEvent.calls.all()) {
      const params = JSON.stringify(call.args[1] ?? {});
      expect(params).not.toMatch(/m\d{3}/);
    }
  });

  it('keeps the local result when submitting fails', async () => {
    await setup(48);
    playToResult();
    sukigao.submit.and.rejectWith(new Error('500'));
    const result = component.game()!.result;
    await component.submit();
    fixture.detectChanges();
    expect(component.submitState()).toBe('error');
    expect(component.game()!.result).toEqual(result);
    expect(localStorage.getItem(SUKIGAO_STATE_KEY)).toContain(result![0]);
    expect(fixture.nativeElement.textContent).toContain('結果已保留在這台裝置');
  });

  it('submits only on explicit opt-in and marks the day', async () => {
    await setup(48);
    playToResult();
    expect(sukigao.submit).not.toHaveBeenCalled();
    sukigao.submit.and.resolveTo({ submittedOn: '2026-09-25', replaced: false });
    await component.submit();
    expect(sukigao.submit).toHaveBeenCalledOnceWith(jasmine.any(String), component.game()!.result!, '48:v');
    expect(component.submitState()).toBe('done');
    expect(component.game()!.submittedOn).toBe('2026-09-25');
  });

  it('undo in the final restores the previous pair', async () => {
    await setup(48);
    component.start();
    while (component.stage() === 'preliminary') {
      component.batch().slice(0, 3).forEach(face => component.togglePick(face.id));
      component.nextBatch();
    }
    const before = component.pair().map(f => f.id).sort();
    component.chooseFinal(component.pair()[0].id);
    component.undo();
    expect(component.pair().map(f => f.id).sort()).toEqual(before);
    expect(component.comparisons()).toBe(0);
  });

  it('elimination advances after ① and ② picks', async () => {
    await setup(120);
    component.start();
    while (component.stage() === 'preliminary') {
      component.batch().slice(0, 4).forEach(face => component.togglePick(face.id));
      component.nextBatch();
    }
    expect(component.stage()).toBe('elimination');
    const [a, b] = component.group();
    component.pickInGroup(a.id);
    expect(component.groupBadge(a.id)).toBe('①');
    component.pickInGroup(b.id);
    expect(component.groupBadge(b.id)).toBe('②');
    await new Promise(resolve => setTimeout(resolve, 320));
    expect(component.game()!.elimination!.groupIndex).toBe(1);
    expect(component.groupPicks()).toEqual([]);
  });

  describe('share text', () => {
    const names = Array.from({ length: 9 }, (_, i) => `N${i + 1}`);

    it('uses medals for the top 3 and numbers after', () => {
      const text = buildShareText(names);
      expect(text).toContain('🥇 N1\n🥈 N2\n🥉 N3\n4. N4');
      expect(text).toContain('#台灣地偶顏控9選');
    });

    it('URL-encodes the X intent', () => {
      const url = buildXShareUrl(['A&B', ...names.slice(1)]);
      expect(url).toContain('A%26B');
      expect(url).toContain(`url=${encodeURIComponent('https://idolmaps.com/sukigao')}`);
      expect(url).not.toContain('\n');
    });
  });
});
