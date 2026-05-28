import { Component, Output, EventEmitter, inject, computed, effect, signal, input, output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';
import { FavoriteEntityType, SpotlightEntity } from '../../models';

const FAV_SEEN_KEY = (id: string) => `fav_seen_${id}`;

interface ActivityData {
  count: number;
  lastAt: string;
}

@Component({
  selector: 'app-favorites-avatar-row',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:12px 10px 10px;border-bottom:1px solid rgba(232,121,160,0.08);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:0 4px;">
        <div style="font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);">已追蹤</div>
        @if (displayItems().length > 0) {
          <button (click)="editMode.set(!editMode())"
            style="font-size:0.65rem;padding:2px 8px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:var(--text-faint-55);cursor:pointer;font-family:var(--font-sans);">
            {{ editMode() ? '完成' : '管理' }}
          </button>
        }
      </div>
      <div
        data-avatar-container
        [style.display]="layout() === 'grid' ? 'grid' : 'flex'"
        [style.grid-template-columns]="layout() === 'grid' ? 'repeat(3, 1fr)' : ''"
        [style.flex-wrap]="layout() === 'grid' ? '' : 'nowrap'"
        [style.overflow-x]="layout() === 'grid' ? 'visible' : 'auto'"
        [style.gap]="'12px'"
        [style.padding-top]="'6px'"
        [style.padding-bottom]="layout() === 'grid' ? '6px' : '4px'"
      >

        @for (item of displayItems(); track item.id) {
          <div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0;position:relative;">

            @if (editMode()) {
              <!-- Remove button overlay -->
              <button (click)="removeFav(item.id, item.entityType)"
                [attr.aria-label]="'移除 ' + item.name + ' 的最愛'"
                style="position:absolute;top:-4px;right:-4px;z-index:2;width:18px;height:18px;border-radius:50%;background:rgba(232,121,160,0.9);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">
                <svg aria-hidden="true" viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round">
                  <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
                </svg>
              </button>
            } @else if (item.badgeCount > 0) {
              <!-- Activity badge -->
              <span style="position:absolute;top:-3px;right:-3px;z-index:2;min-width:16px;height:16px;padding:0 4px;background:rgba(232,121,160,1);border-radius:8px;font-size:0.58rem;color:white;display:flex;align-items:center;justify-content:center;font-weight:700;line-height:1;">
                {{ item.badgeCount > 9 ? '9+' : item.badgeCount }}
              </span>
            }

            <button
              (click)="toggleSelect(item)"
              [attr.aria-label]="(selectedId() === item.id ? '取消篩選 ' : '篩選 ') + item.name + ' 的動態'"
              [attr.aria-pressed]="selectedId() === item.id"
              style="background:none;border:none;padding:0;cursor:pointer;display:block;border-radius:50%;"
            >
              <div [style.background]="item.isGroup
                  ? 'linear-gradient(135deg,rgba(232,121,160,0.35),rgba(192,80,128,0.45))'
                  : 'linear-gradient(135deg,rgba(134,239,172,0.35),rgba(74,222,128,0.5))'"
                [style.border-color]="item.isGroup ? 'rgba(232,121,160,0.5)' : 'rgba(134,239,172,0.55)'"
                [style.opacity]="editMode() ? '0.7' : '1'"
                [style.box-shadow]="selectedId() === item.id
                  ? '0 0 0 2px var(--bg-surface), 0 0 0 4px rgba(232,121,160,0.85)'
                  : 'none'"
                style="
                  width:48px;height:48px;border-radius:50%;
                  border:2px solid;
                  display:flex;align-items:center;justify-content:center;
                  font-size:0.7rem;font-weight:600;color:white;
                  overflow:hidden;transition:opacity 0.15s, box-shadow 0.2s;
                "
              >
                @if (item.photoUrl) {
                  <img [src]="item.photoUrl" [alt]="item.name" style="width:100%;height:100%;object-fit:cover;">
                } @else {
                  {{ item.initials }}
                }
              </div>
            </button>
            <span [style.color]="selectedId() === item.id ? 'rgba(232,121,160,0.9)' : 'var(--text-faint-55)'"
                  style="font-size:0.7rem;max-width:54px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color 0.15s;">
              {{ item.name }}
            </span>
          </div>
        }

        <!-- Add button (hidden in edit mode) -->
        @if (!editMode()) {
          <button (click)="addClicked.emit()" style="
            display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0;
            background:transparent;border:none;cursor:pointer;padding:0;
          ">
            <div style="
              width:48px;height:48px;border-radius:50%;
              border:1.5px dashed rgba(232,121,160,0.4);
              display:flex;align-items:center;justify-content:center;
              font-size:1.2rem;color:rgba(232,121,160,0.5);
            ">+</div>
            <span style="font-size:0.7rem;color:rgba(232,121,160,0.5);">新增</span>
          </button>
        }

      </div>
    </div>
  `,
})
export class FavoritesAvatarRowComponent {
  filter = input<string | undefined>();
  layout = input<'row' | 'grid'>('row');
  selectedId = input<string | undefined>();
  @Input() activityCounts: Record<string, ActivityData> = {};
  @Output() addClicked = new EventEmitter<void>();
  readonly entitySelect = output<SpotlightEntity | null>();

  private favService = inject(FavoritesService);
  private supabase = inject(SupabaseService);

  private readonly _nameCache = signal<Record<string, string>>({});
  private readonly _photoCache = signal<Record<string, string | null>>({});

  readonly editMode = signal(false);

  displayItems = computed(() => {
    const f = this.filter();
    const favs = this.favService.favorites(
      f === 'group' ? 'group'
      : f === 'member' ? 'member'
      : undefined
    );
    const names = this._nameCache();
    const photos = this._photoCache();
    const activity = this.activityCounts;

    const items = favs.map(fav => ({
      id: fav.entity_id,
      entityType: fav.entity_type as FavoriteEntityType,
      isGroup: fav.entity_type === 'group',
      name: names[fav.entity_id] ?? fav.entity_id.slice(0, 4),
      initials: (names[fav.entity_id] ?? fav.entity_id.slice(0, 4)).slice(0, 2).toUpperCase(),
      photoUrl: photos[fav.entity_id] ?? null,
      link: fav.entity_type === 'group' ? `/group/${fav.entity_id}` : `/member/${fav.entity_id}`,
      badgeCount: activity[fav.entity_id]?.count ?? 0,
      lastAt: activity[fav.entity_id]?.lastAt ?? '',
    }));

    // Sort: entities with recent activity first (by lastAt desc), rest maintain order
    return items.sort((a, b) => {
      if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return 0;
    });
  });

  constructor() {
    effect(() => {
      const favs = this.favService.favorites();
      if (favs.length === 0) { this.editMode.set(false); return; }
      const groupIds = favs.filter(f => f.entity_type === 'group').map(f => f.entity_id);
      const memberIds = favs.filter(f => f.entity_type === 'member').map(f => f.entity_id);
      void this.loadDetails(groupIds, memberIds);
    });
  }

  toggleSelect(item: { id: string; entityType: FavoriteEntityType; name: string; link: string }): void {
    if (this.editMode()) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem(FAV_SEEN_KEY(item.id), new Date().toISOString());
    }
    if (this.selectedId() === item.id) {
      this.entitySelect.emit(null);
    } else {
      this.entitySelect.emit({ id: item.id, entityType: item.entityType, name: item.name, link: item.link });
    }
  }

  async removeFav(entityId: string, entityType: FavoriteEntityType): Promise<void> {
    await this.favService.remove(entityType, entityId);
    if (this.favService.favorites().length === 0) this.editMode.set(false);
  }

  async loadDetails(groupIds: string[], memberIds: string[]): Promise<void> {
    const [groupRes, memberRes] = await Promise.all([
      groupIds.length
        ? this.supabase.client.from('groups').select('id,name,photo_url').in('id', groupIds)
        : Promise.resolve({ data: [] }),
      memberIds.length
        ? this.supabase.client.from('members').select('id,name,photo_url').in('id', memberIds)
        : Promise.resolve({ data: [] }),
    ]);

    const names: Record<string, string> = {};
    const photos: Record<string, string | null> = {};
    (groupRes.data ?? []).forEach((g: { id: string; name: string; photo_url: string | null }) => {
      names[g.id] = g.name;
      photos[g.id] = g.photo_url;
    });
    (memberRes.data ?? []).forEach((m: { id: string; name: string; photo_url: string | null }) => {
      names[m.id] = m.name;
      photos[m.id] = m.photo_url;
    });
    this._nameCache.set({ ...this._nameCache(), ...names });
    this._photoCache.set({ ...this._photoCache(), ...photos });
  }

}
