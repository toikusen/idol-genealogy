import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, signal, inject, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FavoritesService } from '../../core/favorites.service';
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';
import { SupabaseService } from '../../core/supabase.service';
import { Group, Member } from '../../models';

type SheetTab = 'group' | 'member';

@Component({
  selector: 'app-favorites-add-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Overlay -->
    <div (click)="close.emit()" style="
      position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:1100;
      backdrop-filter:blur(2px);animation:fadeIn 0.2s;
    " aria-hidden="true"></div>

    <!-- Sheet -->
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-sheet-title"
      (keydown.escape)="close.emit()"
      (keydown.tab)="onTabKey($any($event))"
      style="
        position:fixed;bottom:0;left:0;right:0;z-index:1200;
        background:var(--surface, #fff);border-radius:20px 20px 0 0;
        height:80vh;display:flex;flex-direction:column;
        box-shadow:0 -4px 30px rgba(45,27,46,0.15);
        animation:slideUp 0.25s ease-out;
      ">
      <!-- Handle -->
      <div style="display:flex;justify-content:center;padding:10px 0 4px;">
        <div style="width:36px;height:4px;border-radius:2px;background:rgba(45,27,46,0.15);"></div>
      </div>

      <!-- Title + close -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 20px 0;">
        <div id="add-sheet-title" #sheetTitleRef data-sheet-title tabindex="-1"
             style="font-size:0.9rem;font-weight:700;color:var(--text-primary);outline:none;">新增最愛</div>
        <button (click)="close.emit()" aria-label="關閉" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-faint-55);">✕</button>
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:1px solid rgba(232,121,160,0.15);padding:0 20px;">
        <button (click)="switchTab('group')"
          [style.color]="tab() === 'group' ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
          [style.border-bottom]="tab() === 'group' ? '2px solid rgba(232,121,160,1)' : '2px solid transparent'"
          style="padding:6px 14px 10px;background:none;border:none;cursor:pointer;font-size:0.62rem;font-weight:600;font-family:var(--font-sans);"
        >團體</button>
        <button (click)="switchTab('member')"
          [style.color]="tab() === 'member' ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
          [style.border-bottom]="tab() === 'member' ? '2px solid rgba(232,121,160,1)' : '2px solid transparent'"
          style="padding:6px 14px 10px;background:none;border:none;cursor:pointer;font-size:0.62rem;font-weight:600;font-family:var(--font-sans);"
        >成員</button>
      </div>

      <!-- Search input -->
      <div style="padding:10px 20px 6px;">
        <input #searchInput
          [value]="query()"
          (input)="onInput(searchInput.value)"
          [placeholder]="tab() === 'group' ? '搜尋團體名稱…' : '搜尋成員名稱…'"
          style="width:100%;box-sizing:border-box;padding:7px 12px;border-radius:10px;border:1px solid rgba(232,121,160,0.22);background:rgba(232,121,160,0.05);font-size:16px;font-family:var(--font-sans);outline:none;color:var(--text-primary);">
      </div>

      <!-- Content -->
      <div style="overflow-y:auto;flex:1;padding:0 20px 20px;">

        @if (query().length < 2) {
          <!-- Already following section -->
          @if (favDetails().length > 0) {
            <div style="font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-faint-40);padding:10px 0 6px;">已追蹤</div>
            @for (item of favDetails(); track item.id) {
              <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: item }"></ng-container>
            }
          } @else if (!loadingFavs()) {
            <div style="text-align:center;padding:30px 0;color:var(--text-faint-40);font-size:0.8rem;">
              尚未追蹤任何{{ tab() === 'group' ? '團體' : '成員' }}
            </div>
          }
          @if (loadingFavs()) {
            <div style="text-align:center;padding:20px 0;color:var(--text-faint-40);font-size:0.8rem;">載入中…</div>
          }
          <div style="text-align:center;padding:16px 0 4px;color:var(--text-faint-40);font-size:0.75rem;">
            輸入名稱搜尋更多{{ tab() === 'group' ? '團體' : '成員' }}
          </div>

        } @else {
          <!-- Search results -->
          @if (searching()) {
            <div style="text-align:center;padding:30px 0;color:var(--text-faint-40);font-size:0.8rem;">搜尋中…</div>
          } @else if (searchResults().length === 0) {
            <div style="text-align:center;padding:30px 0;color:var(--text-faint-40);font-size:0.8rem;">
              找不到「{{ query() }}」
            </div>
          } @else {
            @for (item of searchResults(); track item.id) {
              <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: item }"></ng-container>
            }
          }
        }
      </div>
    </div>

    <!-- Row template -->
    <ng-template #rowTpl let-item>
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(232,121,160,0.07);">
        <div [style.background]="tab() === 'group'
            ? 'linear-gradient(135deg,rgba(232,121,160,0.4),rgba(192,80,128,0.55))'
            : 'linear-gradient(135deg,rgba(134,239,172,0.4),rgba(74,222,128,0.55))'"
          [style.border-color]="tab() === 'group' ? 'rgba(232,121,160,0.4)' : 'rgba(134,239,172,0.4)'"
          style="width:36px;height:36px;border-radius:50%;flex-shrink:0;border:1.5px solid;display:flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:600;color:white;overflow:hidden;">
          @if (item.photo_url) { <img [src]="item.photo_url" [alt]="item.name" style="width:100%;height:100%;object-fit:cover;"> }
          @else { {{ item.name.slice(0, 2) }} }
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.65rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ item.name }}</div>
          <div style="font-size:0.54rem;color:var(--text-faint-55);">{{ subtitle(item) }}</div>
        </div>
        <button (click)="toggle(item)"
          [attr.aria-label]="isFav(item.id) ? ('移除 ' + item.name + ' 的最愛') : ('加入 ' + item.name + ' 的最愛')"
          style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.85rem;flex-shrink:0;"
          [style.background]="isFav(item.id) ? 'rgba(232,121,160,0.12)' : 'transparent'"
          [style.border]="tab() === 'group' ? '1px solid rgba(232,121,160,0.3)' : '1px solid rgba(134,239,172,0.3)'"
        >{{ isFav(item.id) ? '♥' : '♡' }}</button>
      </div>
    </ng-template>
  `,
  styles: [`
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
  `],
})
export class FavoritesAddSheetComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() initialTab: 'group' | 'member' = 'group';
  @Output() close = new EventEmitter<void>();

  private favService = inject(FavoritesService);
  private groupService = inject(GroupService);
  private memberService = inject(MemberService);
  private supabase = inject(SupabaseService);

  readonly tab = signal<SheetTab>('group');
  readonly query = signal('');
  readonly loadingFavs = signal(true);
  readonly searching = signal(false);

  private _favGroups = signal<Group[]>([]);
  private _favMembers = signal<Member[]>([]);
  private _searchGroups = signal<Group[]>([]);
  private _searchMembers = signal<Member[]>([]);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('sheetTitleRef') private sheetTitleRef?: ElementRef<HTMLElement>;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private _triggerEl: Element | null = null;
  private _searchSeq = 0;

  readonly favDetails = computed<(Group | Member)[]>(() =>
    this.tab() === 'group' ? this._favGroups() : this._favMembers()
  );

  readonly searchResults = computed<(Group | Member)[]>(() =>
    this.tab() === 'group' ? this._searchGroups() : this._searchMembers()
  );

  async ngOnInit(): Promise<void> {
    if (this.isBrowser) this._triggerEl = document.activeElement;
    this.tab.set(this.initialTab);
    await this.loadFavDetails();
    this.loadingFavs.set(false);
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.sheetTitleRef?.nativeElement.focus();
    }
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this._triggerEl instanceof HTMLElement) this._triggerEl.focus();
  }

  onTabKey(event: KeyboardEvent): void {
    const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const sheet = event.currentTarget as HTMLElement;
    const els = Array.from(sheet.querySelectorAll<HTMLElement>(focusable)).filter(
      el => !el.hasAttribute('disabled') && el.offsetParent !== null
    );
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) { event.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  switchTab(t: SheetTab): void {
    this._searchSeq++;
    this.tab.set(t);
    this.query.set('');
    this.searching.set(false);
    this._searchGroups.set([]);
    this._searchMembers.set([]);
  }

  onInput(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const seq = ++this._searchSeq;
    if (value.length < 2) {
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    const tab = this.tab();
    this.searchTimer = setTimeout(() => void this.doSearch(value, tab, seq), 300);
  }

  isFav(id: string): boolean {
    return this.favService.isFavorite(this.tab(), id);
  }

  subtitle(item: any): string {
    if (this.tab() === 'group') return (item as Group).company ?? '';
    return (item as Member).name_roman ?? '';
  }

  async toggle(item: Group | Member): Promise<void> {
    const t = this.tab();
    if (this.isFav(item.id)) {
      await this.favService.remove(t, item.id);
      // Remove from fav details list
      if (t === 'group') this._favGroups.update(list => list.filter(g => g.id !== item.id));
      else this._favMembers.update(list => list.filter(m => m.id !== item.id));
    } else {
      await this.favService.add(t, item.id);
      // Add to fav details list if not already there
      if (t === 'group') {
        if (!this._favGroups().find(g => g.id === item.id))
          this._favGroups.update(list => [item as Group, ...list]);
      } else {
        if (!this._favMembers().find(m => m.id === item.id))
          this._favMembers.update(list => [item as Member, ...list]);
      }
    }
  }

  private async loadFavDetails(): Promise<void> {
    const groupIds = this.favService.favoriteIds('group');
    const memberIds = this.favService.favoriteIds('member');

    const [groups, members] = await Promise.all([
      groupIds.length
        ? this.supabase.client.from('groups').select('id, name, photo_url, company').in('id', groupIds)
        : Promise.resolve({ data: [] }),
      memberIds.length
        ? this.supabase.client.from('members').select('id, name, name_roman, photo_url').in('id', memberIds)
        : Promise.resolve({ data: [] }),
    ]);

    this._favGroups.set((groups.data ?? []) as Group[]);
    this._favMembers.set((members.data ?? []) as Member[]);
  }

  private async doSearch(q: string, tab: SheetTab, seq: number): Promise<void> {
    try {
      if (tab === 'group') {
        const results = await this.groupService.search(q);
        if (seq !== this._searchSeq || this.tab() !== tab || this.query() !== q) return;
        this._searchGroups.set(results);
      } else {
        const results = await this.memberService.search(q);
        if (seq !== this._searchSeq || this.tab() !== tab || this.query() !== q) return;
        this._searchMembers.set(results);
      }
    } catch {
      // silently ignore search errors
    } finally {
      if (seq === this._searchSeq) this.searching.set(false);
    }
  }
}
