import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SukigaoComponent } from './sukigao.component';
import { SukigaoPool, SukigaoService } from '../../core/sukigao.service';
import { SUKIGAO_STATE_KEY, SukigaoSessionService } from '../../core/sukigao-session.service';
import { AnalyticsService } from '../../core/analytics.service';
import { SupabaseService } from '../../core/supabase.service';
import { SukigaoCandidate } from '../../models';
import { buildFacebookShareUrl, buildShareText, buildThreadsShareUrl } from './sukigao-result.component';

function candidates(n: number): SukigaoCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${String(i).padStart(3, '0')}`,
    name: `成員${i}`,
    photoUrl: '',
    groupNames: [`團${i % 5}`],
    color: null,
    // Every 4th member is retired, so the 現役 scope is a strict subset.
    isCurrent: i % 4 !== 3,
  }));
}

describe('SukigaoComponent', () => {
  let fixture: ComponentFixture<SukigaoComponent>;
  let component: SukigaoComponent;
  let sukigao: jasmine.SpyObj<SukigaoService>;
  let analytics: jasmine.SpyObj<AnalyticsService>;
  /** Who getSessionOnce() reports; null = signed out. */
  let signedInAs: string | null;

  const pool = (n: number): SukigaoPool => ({ candidates: candidates(n), version: `${n}:v`, groupCount: 5 });

  async function setup(n = 48) {
    sukigao = jasmine.createSpyObj<SukigaoService>('SukigaoService', ['getPool', 'getMembersByIds', 'submit', 'getRanking', 'getStats', 'saveMine']);
    sukigao.saveMine.and.resolveTo();
    sukigao.getPool.and.resolveTo(pool(n));
    sukigao.getMembersByIds.and.resolveTo([]);
    sukigao.submit.and.resolveTo({ submittedOn: '2026-09-25', replaced: false });
    sukigao.getStats.and.resolveTo({
      total: 1234,
      plays: 2345,
      players: 1000,
      counts: new Map([['m000', { top9: 400, first: 100 }], ['m001', { top9: 300, first: 200 }]]),
      topTop9Id: 'm000',
      topFirstId: 'm001',
    });
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['trackEvent', 'trackPageView']);
    await TestBed.configureTestingModule({
      imports: [SukigaoComponent],
      providers: [
        provideRouter([]),
        SukigaoSessionService,
        { provide: SukigaoService, useValue: sukigao },
        { provide: AnalyticsService, useValue: analytics },
        { provide: SupabaseService, useValue: { getSessionOnce: () => Promise.resolve(signedInAs ? { user: { id: signedInAs } } : null) } },
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

  /** Submits are queued one at a time, so let the promise chain run out. */
  const settle = async () => {
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
  };

  beforeEach(() => {
    localStorage.clear();
    signedInAs = null;
  });
  afterEach(() => localStorage.clear());

  it('shows the intro with DB-driven counts per scope', async () => {
    await setup(48);
    expect(component.view()).toBe('intro');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('現役成員36 位');
    expect(text).toContain('包含畢業48 位');
    expect(text).toContain('開始選我的顏控9選');
  });

  it('samples the chosen size from the chosen scope', async () => {
    await setup(400);
    expect(component.scope()).toBe('current');
    // Default: everyone in the scope.
    expect(component.selectedSize().size).toBe(0);
    expect(component.selectedSize().count).toBe(300);
    component.selectSize(108);
    component.start();
    const g = component.game()!;
    expect(g.candidateIds.length).toBe(108);
    const retired = new Set(candidates(400).filter(c => !c.isCurrent).map(c => c.id));
    expect(g.candidateIds.some(id => retired.has(id))).toBeFalse();
    expect(g.candidateVersion).toBe('400:v|current|108');
    expect(analytics.trackEvent).toHaveBeenCalledWith('sukigao_start', { candidate_count: 108, scope: 'current' });
  });

  it('includes retired members under 包含畢業', async () => {
    await setup(400);
    component.selectScope('all');
    component.selectSize(0);
    expect(component.selectedSize().count).toBe(400);
    component.start();
    expect(component.game()!.candidateIds.length).toBe(400);
  });

  it('always opens at 現役・全部, ignoring picks saved by older versions', async () => {
    localStorage.setItem('idolmaps:sukigao:prefs', JSON.stringify({ scope: 'all', size: 54 }));
    await setup(400);
    expect(component.scope()).toBe('current');
    expect(component.selectedSize().size).toBe(0);
    expect(component.selectedSize().count).toBe(300);
    expect(localStorage.getItem('idolmaps:sukigao:prefs')).toBeNull();
  });

  it('only offers sizes smaller than the scope, plus 全部', async () => {
    await setup(120); // 90 current
    expect(component.sizeOptions().map(o => o.size)).toEqual([54, 0]);
    component.selectSize(108);
    expect(component.selectedSize().size).toBe(0);
    component.selectScope('all'); // 120
    expect(component.sizeOptions().map(o => o.size)).toEqual([54, 108, 0]);
  });

  it('renders one 3×3 batch of 9 cards with no pick cap', async () => {
    await setup(400);
    component.start();
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('app-sukigao-card button');
    expect(cards.length).toBe(9);
    component.batch().forEach(face => component.togglePick(face.id));
    fixture.detectChanges();
    expect(component.batchPicks().size).toBe(9);
    expect(fixture.nativeElement.querySelectorAll('app-sukigao-card button:disabled').length).toBe(0);
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

  it('shows a different random preview on each visit', async () => {
    await setup(400);
    const first = component.previewFaces().map(f => f.id);
    expect(first.length).toBe(9);
    fixture.destroy();
    TestBed.resetTestingModule();
    await setup(400);
    expect(component.previewFaces().map(f => f.id)).not.toEqual(first);
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
    sukigao.submit.and.rejectWith(new Error('500'));
    playToResult();
    await settle();
    const result = component.game()!.result;
    fixture.detectChanges();
    expect(component.submitState()).toBe('error');
    expect(component.game()!.result).toEqual(result);
    expect(localStorage.getItem(SUKIGAO_STATE_KEY)).toContain(result![0]);
    expect(fixture.nativeElement.textContent).toContain('結果已保留在這台裝置');
    // Retry works once the network is back.
    sukigao.submit.and.resolveTo({ submittedOn: '2026-09-25', replaced: false });
    await component.submit();
    expect(component.submitState()).toBe('done');
  });

  it('adds the result to the ranking automatically when the game ends', async () => {
    await setup(48);
    playToResult();
    await settle();
    expect(sukigao.submit).toHaveBeenCalledOnceWith(jasmine.any(String), component.game()!.result!, '48:v|current|36');
    expect(component.submitState()).toBe('done');
    expect(component.game()!.submittedOn).toBe('2026-09-25');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('已加入大家的顏控排行');
    expect(fixture.nativeElement.textContent).not.toContain('將我的 TOP9 加入大家的顏控排行');
  });

  it('shows everyone\'s numbers on the result page', async () => {
    await setup(48);
    playToResult();
    await settle();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('大家的顏控數據');
    expect(text).toContain('2,345次顏控9選');
    expect(text).toContain('1,000位玩家參與');
    expect(text).toContain('大家最愛的臉');
    expect(text).toContain('32%的人選進 TOP9');
    expect(text).toContain('最多人選為第 1 名');
    expect(text).toContain('你的顏控類型');
  });

  it('leaves the stats card out when stats fail to load', async () => {
    await setup(48);
    sukigao.getStats.and.rejectWith(new Error('502'));
    playToResult();
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('大家的顏控數據');
    expect(fixture.nativeElement.textContent).toContain('已加入大家的顏控排行');
  });

  it('fetches a card for any face the game refers to that the pool lacks', async () => {
    await setup(48);
    component.start();
    const g = component.game()!;
    // A face that is in the game but not in the loaded roster, however it got there.
    const ghost = g.candidateIds[0];
    sukigao.getMembersByIds.and.resolveTo([
      { id: ghost, name: '回來了', photoUrl: '', groupNames: [], color: null, isCurrent: false },
    ]);
    (component as unknown as { faces: { update: (fn: (m: Map<string, unknown>) => Map<string, unknown>) => void } })
      .faces.update(m => { const next = new Map(m); next.delete(ghost); return next; });
    fixture.detectChanges();
    await settle();
    expect(sukigao.getMembersByIds).toHaveBeenCalledWith([ghost]);
    expect(component.batch().find(f => f.id === ghost)!.name).toBe('回來了');
    expect(analytics.trackEvent).toHaveBeenCalledWith('sukigao_missing_faces', { count: 1, stage: 'preliminary' });
  });

  it('on reload, fetches faces referenced outside candidateIds too', async () => {
    await setup(48);
    component.start();
    const saved = { ...component.game()!, fillPicks: ['stranger'] };
    localStorage.setItem(SUKIGAO_STATE_KEY, JSON.stringify(saved));
    sukigao.getMembersByIds.calls.reset();
    await component.load();
    expect(sukigao.getMembersByIds).toHaveBeenCalledWith(['stranger']);
  });

  it('signed in: saves the finished TOP 9 to 我的最愛 once', async () => {
    signedInAs = 'user-1';
    await setup(48);
    playToResult();
    await settle();
    const g = component.game()!;
    expect(sukigao.saveMine).toHaveBeenCalledOnceWith(g.sessionId, g.result!, g.candidateVersion);
    expect(component.accountSave()).toBe('saved');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('已存到我的最愛');
    // Reloading the page doesn't send it again.
    await component.load();
    await settle();
    expect(sukigao.saveMine).toHaveBeenCalledTimes(1);
  });

  it('signed out: invites the player to sign in to keep the result', async () => {
    await setup(48);
    playToResult();
    await settle();
    expect(sukigao.saveMine).not.toHaveBeenCalled();
    expect(component.accountSave()).toBe('signed-out');
    fixture.detectChanges();
    const cta: HTMLAnchorElement = fixture.nativeElement.querySelector('.skr-account__cta');
    expect(cta.textContent).toContain('登入保存紀錄');
    expect(cta.getAttribute('href')).toBe('/login?returnUrl=%2Fsukigao');
  });

  it('saves a result finished signed out once the player comes back signed in', async () => {
    await setup(48);
    playToResult();
    await settle();
    expect(sukigao.saveMine).not.toHaveBeenCalled();
    signedInAs = 'user-1';
    await component.load();
    await settle();
    expect(sukigao.saveMine).toHaveBeenCalledTimes(1);
  });

  it('shows a retry when saving to 我的最愛 fails', async () => {
    signedInAs = 'user-1';
    await setup(48);
    sukigao.saveMine.and.rejectWith(new Error('500'));
    playToResult();
    await settle();
    expect(component.accountSave()).toBe('error');
    sukigao.saveMine.and.resolveTo();
    await component.saveToAccount();
    expect(component.accountSave()).toBe('saved');
  });

  it('re-submits (replacing) after undoing and finishing again', async () => {
    await setup(48);
    playToResult();
    await settle();
    component.undo();
    expect(component.stage()).toBe('final');
    component.chooseFinal(component.pair()[0].id);
    await settle();
    expect(sukigao.submit).toHaveBeenCalledTimes(2);
  });

  it('re-sends a result undone after it was submitted, and ignores the stale reply', async () => {
    await setup(48);
    let resolveFirst!: (v: { submittedOn: string; replaced: boolean }) => void;
    sukigao.submit.and.returnValue(new Promise(r => (resolveFirst = r)));
    playToResult();
    component.undo();
    expect(component.game()!.submittedOn).toBeNull();
    sukigao.submit.and.resolveTo({ submittedOn: '2026-09-25', replaced: true });
    let guard = 0;
    while (component.stage() === 'final' && guard++ < 200) component.chooseFinal(component.pair()[1].id);
    const second = component.game()!.result!;
    resolveFirst({ submittedOn: '2026-09-25', replaced: false });
    await settle();
    expect(sukigao.submit).toHaveBeenCalledTimes(2);
    expect(sukigao.submit.calls.mostRecent().args[1]).toEqual(second);
    expect(component.submitState()).toBe('done');
    expect(component.submitReplaced()).toBeTrue();
  });

  it('shows a result sent on an earlier day without counting it again', async () => {
    await setup(48);
    playToResult();
    await settle();
    const saved = { ...component.game()!, submittedOn: '2000-01-01' };
    localStorage.setItem(SUKIGAO_STATE_KEY, JSON.stringify(saved));
    sukigao.submit.calls.reset();
    await component.load();
    component.resume();
    await settle();
    expect(sukigao.submit).not.toHaveBeenCalled();
    expect(component.submitState()).toBe('done');
  });

  it('arrow keys do nothing on the intro even with a saved final', async () => {
    await setup(48);
    component.start();
    while (component.stage() === 'preliminary') {
      component.batch().slice(0, 3).forEach(face => component.togglePick(face.id));
      component.nextBatch();
    }
    expect(component.stage()).toBe('final');
    component.backToIntro();
    const before = component.comparisons();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(component.comparisons()).toBe(before);
  });

  it('undo during the ①② advance delay cancels the advance', async () => {
    await setup(120);
    component.start();
    while (component.stage() === 'preliminary') {
      component.batch().slice(0, 4).forEach(face => component.togglePick(face.id));
      component.nextBatch();
    }
    const [a, b] = component.group();
    component.pickInGroup(a.id);
    component.pickInGroup(b.id);
    component.undo();
    await new Promise(resolve => setTimeout(resolve, 320));
    expect(component.game()!.elimination!.groupIndex).toBe(0);
    // And the next picks still work (no stuck timer).
    component.pickInGroup(a.id);
    expect(component.groupPicks()).toEqual([a.id]);
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

    it('URL-encodes the Threads intent with the TOP 9 text', () => {
      const url = buildThreadsShareUrl(['A&B', ...names.slice(1)]);
      expect(url).toMatch(/^https:\/\/www\.threads\.net\/intent\/post\?text=/);
      expect(url).toContain('A%26B');
      expect(url).toContain(`url=${encodeURIComponent('https://idolmaps.com/sukigao')}`);
      expect(url).not.toContain('\n');
    });

    it('points the Facebook sharer at the game page', () => {
      expect(buildFacebookShareUrl()).toBe(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://idolmaps.com/sukigao')}`,
      );
    });
  });
});
