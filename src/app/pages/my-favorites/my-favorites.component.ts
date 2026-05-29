import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';
import { SpotlightEntity } from '../../models';
import { FavoritesAvatarRowComponent } from './favorites-avatar-row.component';
import { FavoritesFeedComponent } from './favorites-feed.component';
import { FavoritesAddSheetComponent } from './favorites-add-sheet.component';
import { PushSettingsComponent } from './push-settings.component';

export type FavoritesTab = 'all' | 'group' | 'member' | 'push';

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
  ],
  templateUrl: './my-favorites.component.html',
  styleUrl: './my-favorites.component.css',
})
export class MyFavoritesComponent implements OnInit {
  private favService = inject(FavoritesService);
  private supabase = inject(SupabaseService);

  readonly activeTab = signal<FavoritesTab>('all');
  readonly showAddSheet = signal(false);
  readonly spotlightEntity = signal<SpotlightEntity | null>(null);
  readonly activityCounts = signal<Record<string, { count: number; lastAt: string }>>({});
  addSheetInitialTab: 'group' | 'member' = 'group';
  readonly tabs: FavoritesTabOption[] = [
    { id: 'all', label: '全部' },
    { id: 'group', label: '團體' },
    { id: 'member', label: '成員' },
    { id: 'push', label: '通知設定' },
  ];
  displayName = '';

  async ngOnInit(): Promise<void> {
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
