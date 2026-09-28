import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SukigaoService } from '../../../core/sukigao.service';
import { SukigaoAdminStats } from '../../../models';
import { ADMIN_SUKIGAO_PAGE, AdminSukigaoComponent, bandOf, buildAdminRows } from './admin-sukigao.component';

const stats = (): SukigaoAdminStats => ({
  total: 100,
  plays: 180,
  players: 70,
  members: [
    { member_id: 'a', name: 'A', top9: 40, first: 5 },
    { member_id: 'b', name: 'B', top9: 10, first: 20 },
    { member_id: 'gone', name: 'Gone', top9: 2, first: 0 },
  ],
  setups: [{ scope: 'current', size: 54, results: 60 }, { scope: 'all', size: 108, results: 40 }],
  daily: [{ day: '2026-09-27', results: 3, plays: 5 }, { day: '2026-09-28', results: 4, plays: 9 }],
});

const pool = [
  { id: 'a', name: 'A', photoUrl: '', groupNames: ['G1'], isCurrent: true, color: null },
  { id: 'b', name: 'B', photoUrl: '', groupNames: [], isCurrent: false, color: null },
  { id: 'c', name: 'C', photoUrl: '', groupNames: ['G2'], isCurrent: true, color: null },
];

describe('AdminSukigaoComponent', () => {
  it('buildAdminRows lists the whole pool (0 picks too) plus picked members who left it', () => {
    const rows = buildAdminRows(stats(), pool);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'gone']);
    expect(rows.find(r => r.id === 'c')!.top9).toBe(0);
    expect(rows.find(r => r.id === 'b')!.groups).toBe('Solo');
    expect(rows.find(r => r.id === 'gone')!.isCurrent).toBeNull();
  });

  it('bandOf splits by TOP 9 share', () => {
    expect(bandOf(3, 100)).toBe('high');
    expect(bandOf(1, 100)).toBe('mid');
    expect(bandOf(1, 1000)).toBe('low');
    expect(bandOf(0, 100)).toBe('zero');
  });

  describe('page', () => {
    let fixture: ComponentFixture<AdminSukigaoComponent>;
    let sukigao: jasmine.SpyObj<SukigaoService>;

    beforeEach(async () => {
      sukigao = jasmine.createSpyObj<SukigaoService>('SukigaoService', ['getAdminStats', 'getPool']);
      sukigao.getAdminStats.and.resolveTo(stats());
      sukigao.getPool.and.resolveTo({ candidates: pool, version: 'v', groupCount: 2 });
      await TestBed.configureTestingModule({
        imports: [AdminSukigaoComponent],
        providers: [provideRouter([]), { provide: SukigaoService, useValue: sukigao }],
      }).compileComponents();
      fixture = TestBed.createComponent(AdminSukigaoComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('shows totals, setups and members sorted by TOP 9 picks', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('180');
      expect(el.textContent).toContain('現役 · 54 人');
      const names = Array.from(el.querySelectorAll('tbody tr td:nth-child(2) .block:first-child')).map(e => e.textContent!.trim());
      expect(names[0]).toContain('A');
      expect(el.textContent).toContain('40%');
    });

    it('sorts by first places and filters graduates', () => {
      const c = fixture.componentInstance;
      c.sort.set('first');
      expect(c.visibleRows()[0].id).toBe('b');
      c.filter.set('graduated');
      expect(c.visibleRows().map(r => r.id)).toEqual(['b', 'gone']);
      c.filter.set('current');
      c.query.set('g2');
      expect(c.visibleRows().map(r => r.id)).toEqual(['c']);
    });

    it('shows 30 members at a time with 查看更多, and starts over when the view changes', () => {
      const c = fixture.componentInstance;
      const many = Array.from({ length: 70 }, (_, i) => ({ id: `m${i}`, name: `M${i}`, groups: 'G', photoUrl: '', isCurrent: true, top9: 70 - i, first: 0 }));
      c.rows.set(many);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('.ask-members tbody tr').length).toBe(ADMIN_SUKIGAO_PAGE);
      const more = () => Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('查看更多'));
      expect(more()!.textContent).toContain('還有 40 位');
      more()!.click();
      fixture.detectChanges();
      expect(el.querySelectorAll('.ask-members tbody tr').length).toBe(60);
      more()!.click();
      fixture.detectChanges();
      expect(el.querySelectorAll('.ask-members tbody tr').length).toBe(70);
      expect(more()).toBeUndefined();
      c.setSort('first');
      fixture.detectChanges();
      expect(el.querySelectorAll('.ask-members tbody tr').length).toBe(ADMIN_SUKIGAO_PAGE);
    });

    it('shows the refusal when the RPC rejects', async () => {
      sukigao.getAdminStats.and.rejectWith(new Error('get_sukigao_admin_stats: staff only'));
      await fixture.componentInstance.load();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('staff only');
    });
  });
});
