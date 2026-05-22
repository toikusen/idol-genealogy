import { Component, Output, EventEmitter, inject, computed, effect, signal, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';
import { FavoriteEntityType } from '../../models';

@Component({
  selector: 'app-favorites-avatar-row',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div style="padding:12px 20px 8px;border-bottom:1px solid rgba(232,121,160,0.08);">
      <div style="font-size:0.55rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);margin-bottom:10px;">
        已追蹤
      </div>
      <div
        data-avatar-container
        [style.display]="'flex'"
        [style.flex-wrap]="layout() === 'grid' ? 'wrap' : 'nowrap'"
        [style.overflow-x]="layout() === 'grid' ? 'hidden' : 'auto'"
        [style.gap]="'10px'"
        [style.padding-bottom]="layout() === 'grid' ? '0' : '4px'"
      >

        @for (item of displayItems(); track item.id) {
          <a [routerLink]="item.link" style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;text-decoration:none;">
            <div [style.background]="item.isGroup
                ? 'linear-gradient(135deg,rgba(232,121,160,0.35),rgba(192,80,128,0.45))'
                : 'linear-gradient(135deg,rgba(134,239,172,0.35),rgba(74,222,128,0.5))'"
              [style.border-color]="item.isGroup ? 'rgba(232,121,160,0.5)' : 'rgba(134,239,172,0.55)'"
              style="
                width:44px;height:44px;border-radius:50%;
                border:2px solid;
                display:flex;align-items:center;justify-content:center;
                font-size:0.6rem;font-weight:600;color:white;
                overflow:hidden;
              "
            >
              @if (item.photoUrl) {
                <img [src]="item.photoUrl" [alt]="item.name" style="width:100%;height:100%;object-fit:cover;">
              } @else {
                {{ item.initials }}
              }
            </div>
            <span style="font-size:0.52rem;color:var(--text-faint-55);max-width:48px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              {{ item.name }}
            </span>
          </a>
        }

        <!-- Add button -->
        <button (click)="addClicked.emit()" style="
          display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;
          background:transparent;border:none;cursor:pointer;padding:0;
        ">
          <div style="
            width:44px;height:44px;border-radius:50%;
            border:1.5px dashed rgba(232,121,160,0.4);
            display:flex;align-items:center;justify-content:center;
            font-size:1.1rem;color:rgba(232,121,160,0.5);
          ">+</div>
          <span style="font-size:0.52rem;color:rgba(232,121,160,0.5);">新增</span>
        </button>

      </div>
    </div>
  `,
})
export class FavoritesAvatarRowComponent {
  filter = input<string | undefined>();
  layout = input<'row' | 'grid'>('row');
  @Output() addClicked = new EventEmitter<void>();

  private favService = inject(FavoritesService);
  private groupService = inject(GroupService);
  private memberService = inject(MemberService);

  private readonly _nameCache = signal<Record<string, string>>({});
  private readonly _photoCache = signal<Record<string, string | null>>({});

  displayItems = computed(() => {
    const f = this.filter();
    const favs = this.favService.favorites(
      f === 'group' ? 'group'
      : f === 'member' ? 'member'
      : undefined
    );
    const names = this._nameCache();
    const photos = this._photoCache();
    return favs.map(f => ({
      id: f.entity_id,
      isGroup: f.entity_type === 'group',
      name: names[f.entity_id] ?? f.entity_id.slice(0, 4),
      initials: (names[f.entity_id] ?? f.entity_id.slice(0, 4)).slice(0, 2).toUpperCase(),
      photoUrl: photos[f.entity_id] ?? null,
      link: f.entity_type === 'group' ? `/group/${f.entity_id}` : `/member/${f.entity_id}`,
    }));
  });

  constructor() {
    effect(() => {
      const favs = this.favService.favorites();
      if (favs.length === 0) return;
      const groupIds = favs.filter(f => f.entity_type === 'group').map(f => f.entity_id);
      const memberIds = favs.filter(f => f.entity_type === 'member').map(f => f.entity_id);
      this.loadDetails(groupIds, memberIds);
    });
  }

  async loadDetails(groupIds: string[], memberIds: string[]): Promise<void> {
    const [groups, members] = await Promise.all([
      groupIds.length ? this.groupService.getAll() : Promise.resolve([]),
      memberIds.length ? this.memberService.getAll() : Promise.resolve([]),
    ]);
    const names: Record<string, string> = {};
    const photos: Record<string, string | null> = {};
    groups.forEach(g => { names[g.id] = g.name; photos[g.id] = g.photo_url; });
    members.forEach(m => { names[m.id] = m.name; photos[m.id] = m.photo_url; });
    this._nameCache.set({ ...this._nameCache(), ...names });
    this._photoCache.set({ ...this._photoCache(), ...photos });
  }
}
