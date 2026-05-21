import { Component, Output, EventEmitter, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FavoritesService } from '../../core/favorites.service';
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';
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
    "></div>

    <!-- Sheet -->
    <div style="
      position:fixed;bottom:0;left:0;right:0;z-index:1200;
      background:var(--surface, #fff);border-radius:20px 20px 0 0;
      max-height:80vh;display:flex;flex-direction:column;
      box-shadow:0 -4px 30px rgba(45,27,46,0.15);
      animation:slideUp 0.25s ease-out;
    ">
      <div style="display:flex;justify-content:center;padding:10px 0 4px;">
        <div style="width:36px;height:4px;border-radius:2px;background:rgba(45,27,46,0.15);"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 20px 0;">
        <div style="font-size:0.9rem;font-weight:700;color:var(--text-primary);">新增最愛</div>
        <button (click)="close.emit()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-faint-55);">✕</button>
      </div>
      <div style="display:flex;border-bottom:1px solid rgba(232,121,160,0.15);padding:0 20px;">
        <button (click)="tab.set('group')"
          [style.color]="tab() === 'group' ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
          [style.border-bottom]="tab() === 'group' ? '2px solid rgba(232,121,160,1)' : '2px solid transparent'"
          style="padding:6px 14px 10px;background:none;border:none;cursor:pointer;font-size:0.62rem;font-weight:600;font-family:var(--font-sans);"
        >團體</button>
        <button (click)="tab.set('member')"
          [style.color]="tab() === 'member' ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
          [style.border-bottom]="tab() === 'member' ? '2px solid rgba(232,121,160,1)' : '2px solid transparent'"
          style="padding:6px 14px 10px;background:none;border:none;cursor:pointer;font-size:0.62rem;font-weight:600;font-family:var(--font-sans);"
        >成員</button>
      </div>
      <div style="padding:10px 20px 6px;">
        <input [(ngModel)]="query" [placeholder]="tab() === 'group' ? '搜尋團體名稱…' : '搜尋成員名稱…'"
          style="width:100%;box-sizing:border-box;padding:7px 12px;border-radius:10px;border:1px solid rgba(232,121,160,0.22);background:rgba(232,121,160,0.05);font-size:0.65rem;font-family:var(--font-sans);outline:none;color:var(--text-primary);">
      </div>
      <div style="overflow-y:auto;flex:1;padding:0 20px 20px;">
        @if (loading()) {
          <div style="text-align:center;padding:30px 0;color:var(--text-faint-40);font-size:0.8rem;">載入中…</div>
        }
        @if (tab() === 'group') {
          @for (g of filteredGroups(); track g.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(232,121,160,0.07);">
              <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,rgba(232,121,160,0.4),rgba(192,80,128,0.55));border:1.5px solid rgba(232,121,160,0.4);display:flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:600;color:white;overflow:hidden;">
                @if (g.photo_url) { <img [src]="g.photo_url" [alt]="g.name" style="width:100%;height:100%;object-fit:cover;"> }
                @else { {{ g.name.slice(0,2) }} }
              </div>
              <div style="flex:1;">
                <div style="font-size:0.65rem;font-weight:600;color:var(--text-primary);">{{ g.name }}</div>
                <div style="font-size:0.54rem;color:var(--text-faint-55);">{{ g.company ?? '' }}</div>
              </div>
              <button (click)="toggleGroup(g)" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgba(232,121,160,0.3);font-size:0.85rem;"
                [style.background]="isFav('group', g.id) ? 'rgba(232,121,160,0.12)' : 'transparent'"
              >{{ isFav('group', g.id) ? '♥' : '♡' }}</button>
            </div>
          }
        }
        @if (tab() === 'member') {
          @for (m of filteredMembers(); track m.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(232,121,160,0.07);">
              <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,rgba(134,239,172,0.4),rgba(74,222,128,0.55));border:1.5px solid rgba(134,239,172,0.4);display:flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:600;color:white;overflow:hidden;">
                @if (m.photo_url) { <img [src]="m.photo_url" [alt]="m.name" style="width:100%;height:100%;object-fit:cover;"> }
                @else { {{ m.name.slice(0,2) }} }
              </div>
              <div style="flex:1;">
                <div style="font-size:0.65rem;font-weight:600;color:var(--text-primary);">{{ m.name }}</div>
                <div style="font-size:0.54rem;color:var(--text-faint-55);">{{ m.name_roman ?? '' }}</div>
              </div>
              <button (click)="toggleMember(m)" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgba(134,239,172,0.3);font-size:0.85rem;"
                [style.background]="isFav('member', m.id) ? 'rgba(134,239,172,0.12)' : 'transparent'"
              >{{ isFav('member', m.id) ? '♥' : '♡' }}</button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
  `],
})
export class FavoritesAddSheetComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  private favService = inject(FavoritesService);
  private groupService = inject(GroupService);
  private memberService = inject(MemberService);

  readonly tab = signal<SheetTab>('group');
  readonly loading = signal(true);
  query = '';

  private allGroups: Group[] = [];
  private allMembers: Member[] = [];

  async ngOnInit(): Promise<void> {
    const [groups, members] = await Promise.all([
      this.groupService.getAll(),
      this.memberService.getAll(),
    ]);
    this.allGroups = groups;
    this.allMembers = members;
    this.loading.set(false);
  }

  filteredGroups(): Group[] {
    const q = this.query.toLowerCase();
    return q ? this.allGroups.filter(g => g.name.toLowerCase().includes(q)) : this.allGroups;
  }

  filteredMembers(): Member[] {
    const q = this.query.toLowerCase();
    return q ? this.allMembers.filter(m => m.name.toLowerCase().includes(q) || (m.name_roman ?? '').toLowerCase().includes(q)) : this.allMembers;
  }

  isFav(type: 'group' | 'member', id: string): boolean {
    return this.favService.isFavorite(type, id);
  }

  async toggleGroup(g: Group): Promise<void> {
    this.isFav('group', g.id)
      ? await this.favService.remove('group', g.id)
      : await this.favService.add('group', g.id);
  }

  async toggleMember(m: Member): Promise<void> {
    this.isFav('member', m.id)
      ? await this.favService.remove('member', m.id)
      : await this.favService.add('member', m.id);
  }
}
