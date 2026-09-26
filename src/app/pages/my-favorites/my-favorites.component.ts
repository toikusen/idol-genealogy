import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { PushOptInService } from '../../core/push-opt-in.service';
import { SupabaseService } from '../../core/supabase.service';
import { SpotlightEntity } from '../../models';
import { FavoritesAvatarRowComponent } from './favorites-avatar-row.component';
import { FavoritesFeedComponent } from './favorites-feed.component';
import { FavoritesAddSheetComponent } from './favorites-add-sheet.component';
import { PushSettingsComponent } from './push-settings.component';
import { FavoritesSukigaoComponent } from './favorites-sukigao.component';

export type FavoritesTab = 'all' | 'group' | 'member' | 'sukigao' | 'push';

interface FavoritesTabOption {
  id: FavoritesTab;
  label: string;
}

@Component({
  selector: 'app-my-favorites',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FavoritesAvatarRowComponent,
    FavoritesFeedComponent,
    FavoritesAddSheetComponent,
    PushSettingsComponent,
    FavoritesSukigaoComponent,
  ],
  templateUrl: './my-favorites.component.html',
  styleUrl: './my-favorites.component.css',
})
export class MyFavoritesComponent implements OnInit {
  private favService = inject(FavoritesService);
  readonly pushOptIn = inject(PushOptInService);

  /** Favourites already saved but not reachable by push — what the nudge is about. */
  favoriteCount(): number {
    return this.favService.favorites().length;
  }
  private supabase = inject(SupabaseService);
  private route = inject(ActivatedRoute);

  readonly activeTab = signal<FavoritesTab>('all');
  readonly showAddSheet = signal(false);
  readonly spotlightEntity = signal<SpotlightEntity | null>(null);
  readonly activityCounts = signal<Record<string, { count: number; lastAt: string }>>({});
  addSheetInitialTab: 'group' | 'member' = 'group';
  readonly tabs: FavoritesTabOption[] = [
    { id: 'all', label: '全部' },
    { id: 'group', label: '團體' },
    { id: 'member', label: '成員' },
    { id: 'sukigao', label: '顏控9選' },
    { id: 'push', label: '通知設定' },
  ];
  displayName = '';

  /** The avatar row / feed filter for feed tabs; null on 顏控9選 and 通知設定. */
  feedFilter(): 'group' | 'member' | undefined | null {
    const t = this.activeTab();
    if (t === 'all') return undefined;
    return t === 'group' || t === 'member' ? t : null;
  }

  async ngOnInit(): Promise<void> {
    // ?tab= deep link, e.g. from the 顏控9選 result page's 「查看我的顏控紀錄」.
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab && this.tabs.some(t => t.id === tab)) this.activeTab.set(tab as FavoritesTab);
    const session = await this.supabase.getSessionOnce();
    if (session) {
      this.displayName = session.user.user_metadata?.['display_name'] ?? '';
      await this.favService.load(session.user.id);
    }
  }

  setTab(tab: FavoritesTab): void {
    this.activeTab.set(tab);
    this.spotlightEntity.set(null);
  }

  onEntitySelect(entity: SpotlightEntity | null): void {
    this.spotlightEntity.set(entity);
    if (entity) {
      const current = this.activityCounts();
      if (current[entity.id]) {
        this.activityCounts.set({ ...current, [entity.id]: { ...current[entity.id], count: 0 } });
      }
    }
  }

  onActivityCounts(counts: Record<string, { count: number; lastAt: string }>): void {
    this.activityCounts.set(counts);
  }

  openAddSheet(): void {
    const t = this.activeTab();
    this.addSheetInitialTab = t === 'member' ? 'member' : 'group';
    this.showAddSheet.set(true);
  }

  closeAddSheet(): void {
    this.showAddSheet.set(false);
  }
}
