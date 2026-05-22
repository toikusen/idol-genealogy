import { Component, Input, inject, signal } from '@angular/core';
import { FavoritesService } from '../../core/favorites.service';
import { FavoriteEntityType } from '../../models';

@Component({
  selector: 'app-favorite-toggle',
  standalone: true,
  template: `
    <button
      (click)="toggle()"
      [attr.aria-label]="isFav() ? '取消最愛' : '加入最愛'"
      [class.is-fav]="isFav()"
      [disabled]="loading()"
      style="
        width: 38px; height: 38px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.2rem; cursor: pointer;
        border: 1.5px solid rgba(232,121,160,0.3);
        background: rgba(255,255,255,0.7);
        transition: all 0.2s;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      "
      [style.color]="isFav() ? 'rgba(232,121,160,1)' : 'rgba(232,121,160,0.4)'"
      [style.background]="isFav() ? 'rgba(232,121,160,0.12)' : 'rgba(255,255,255,0.7)'"
      [style.border-color]="isFav() ? 'rgba(232,121,160,0.5)' : 'rgba(232,121,160,0.3)'"
      [style.box-shadow]="isFav() ? '0 2px 8px rgba(232,121,160,0.25)' : 'none'"
    >
      {{ isFav() ? '♥' : '♡' }}
    </button>
  `,
})
export class FavoriteToggleComponent {
  @Input({ required: true }) entityType!: FavoriteEntityType;
  @Input({ required: true }) entityId!: string;

  private favService = inject(FavoritesService);
  readonly loading = signal(false);

  isFav(): boolean {
    return this.favService.isFavorite(this.entityType, this.entityId);
  }

  async toggle(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      if (this.isFav()) {
        await this.favService.remove(this.entityType, this.entityId);
      } else {
        await this.favService.add(this.entityType, this.entityId);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
