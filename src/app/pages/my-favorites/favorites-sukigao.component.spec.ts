import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FavoritesSukigaoComponent, mostPicked } from './favorites-sukigao.component';
import { SukigaoService } from '../../core/sukigao.service';
import { FavoritesService } from '../../core/favorites.service';
import { SukigaoCandidate, SukigaoUserResult } from '../../models';

const ids = (from: number) => Array.from({ length: 9 }, (_, i) => `m${from + i}`);
const game = (id: string, members: string[], played_at: string): SukigaoUserResult => ({ id, session_id: id, member_ids: members, played_at });
const card = (id: string): SukigaoCandidate => ({ id, name: `名${id}`, photoUrl: '', groupNames: [], color: null, isCurrent: true });

describe('mostPicked', () => {
  it('counts appearances across games and breaks ties by #1 finishes', () => {
    const results = [game('a', ids(0), ''), game('b', ids(1), ''), game('c', ['m5', ...ids(10).slice(0, 8)], '')];
    const top = mostPicked(results, 3);
    expect(top[0]).toEqual({ id: 'm5', count: 3, firsts: 1 });
    expect(top[1].count).toBe(2);
  });
});

describe('FavoritesSukigaoComponent', () => {
  let fixture: ComponentFixture<FavoritesSukigaoComponent>;
  let sukigao: jasmine.SpyObj<SukigaoService>;

  async function setup(results: SukigaoUserResult[]) {
    sukigao = jasmine.createSpyObj<SukigaoService>('SukigaoService', ['getMine', 'deleteMine', 'getPool', 'getMembersByIds']);
    sukigao.getMine.and.resolveTo(results);
    sukigao.getPool.and.resolveTo({ candidates: ids(0).map(card), version: 'v', groupCount: 1 });
    sukigao.getMembersByIds.and.callFake((missing: string[]) => Promise.resolve(missing.map(card)));
    sukigao.deleteMine.and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [FavoritesSukigaoComponent],
      providers: [
        provideRouter([]),
        { provide: SukigaoService, useValue: sukigao },
        { provide: FavoritesService, useValue: { isFavorite: () => false, isSignedIn: () => true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FavoritesSukigaoComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('invites the player to play when there is no history', async () => {
    await setup([]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('還沒有顏控9選紀錄');
    expect(fixture.nativeElement.querySelector('a.fs-cta').getAttribute('href')).toBe('/sukigao');
  });

  it('shows the play count, most picked faces and each game', async () => {
    await setup([game('g2', ids(1), '2026-09-26T04:00:00Z'), game('g1', ids(0), '2026-09-25T10:30:00Z')]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('你玩了 2 次顏控9選');
    expect(text).toContain('你最常選的臉');
    expect(text).toContain('選了 2 次');
    expect(text).toContain('2026/09/26 12:00');
    expect(fixture.nativeElement.querySelectorAll('.fs-game').length).toBe(2);
    // Faces outside the pool come from members.
    expect(sukigao.getMembersByIds).toHaveBeenCalledWith(['m9']);
    // The newest game starts open, with its ranking and hearts.
    expect(fixture.nativeElement.querySelectorAll('.fs-rank__row').length).toBe(9);
    expect(text).toContain('名m1');
  });

  it('deletes a game after confirming', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const g = game('g1', ids(0), '2026-09-25T10:30:00Z');
    await setup([g]);
    await fixture.componentInstance.remove(g);
    fixture.detectChanges();
    expect(sukigao.deleteMine).toHaveBeenCalledWith('g1');
    expect(fixture.nativeElement.textContent).toContain('還沒有顏控9選紀錄');
  });
});
