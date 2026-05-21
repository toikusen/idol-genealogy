import { Component, Input, Output, EventEmitter, inject, computed } from '@angular/core';
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
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;">

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
  @Input() filter?: string;
  @Output() addClicked = new EventEmitter<void>();

  private favService = inject(FavoritesService);
  private groupService = inject(GroupService);
  private memberService = inject(MemberService);

  private _groupCache = new Map<string, { name: string; photo_url: string | null }>();
  private _memberCache = new Map<string, { name: string; photo_url: string | null }>();

  displayItems = computed(() => {
    const favs = this.favService.favorites(
      this.filter === 'group' ? 'group'
      : this.filter === 'member' ? 'member'
      : undefined
    );
    return favs.map(f => ({
      id: f.entity_id,
      isGroup: f.entity_type === 'group',
      name: this._nameFor(f.entity_type, f.entity_id),
      initials: this._initialsFor(f.entity_type, f.entity_id),
      photoUrl: this._photoFor(f.entity_type, f.entity_id),
      link: f.entity_type === 'group' ? `/group/${f.entity_id}` : `/member/${f.entity_id}`,
    }));
  });

  private _nameFor(type: FavoriteEntityType, id: string): string {
    if (type === 'group') return this._groupCache.get(id)?.name ?? id.slice(0, 4);
    return this._memberCache.get(id)?.name ?? id.slice(0, 4);
  }

  private _initialsFor(type: FavoriteEntityType, id: string): string {
    const name = this._nameFor(type, id);
    return name.slice(0, 2).toUpperCase();
  }

  private _photoFor(type: FavoriteEntityType, id: string): string | null {
    if (type === 'group') return this._groupCache.get(id)?.photo_url ?? null;
    return this._memberCache.get(id)?.photo_url ?? null;
  }

  async loadDetails(groupIds: string[], memberIds: string[]): Promise<void> {
    const [groups, members] = await Promise.all([
      groupIds.length ? this.groupService.getAll() : Promise.resolve([]),
      memberIds.length ? this.memberService.getAll() : Promise.resolve([]),
    ]);
    groups.forEach(g => this._groupCache.set(g.id, { name: g.name, photo_url: g.photo_url }));
    members.forEach(m => this._memberCache.set(m.id, { name: m.name, photo_url: m.photo_url }));
  }
}
