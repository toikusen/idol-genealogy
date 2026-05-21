import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';
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
})
export class MyFavoritesComponent implements OnInit {
  private favService = inject(FavoritesService);
  private supabase = inject(SupabaseService);

  readonly activeTab = signal<FavoritesTab>('all');
  readonly showAddSheet = signal(false);
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
  }

  openAddSheet(): void {
    this.showAddSheet.set(true);
  }

  closeAddSheet(): void {
    this.showAddSheet.set(false);
  }
}
