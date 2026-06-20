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
      class="fav-btn"
    >
      {{ isFav() ? '♥' : '♡' }}
    </button>
  `,
  styles: [`
    .fav-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      cursor: pointer;
      border: 1.5px solid rgba(232, 121, 160, 0.3);
      background: rgba(255, 255, 255, 0.7);
      color: rgba(232, 121, 160, 0.4);
      box-shadow: none;
      transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    .fav-btn.is-fav {
      color: rgba(232, 121, 160, 1);
      background: rgba(232, 121, 160, 0.12);
      border-color: rgba(232, 121, 160, 0.5);
      box-shadow: 0 2px 8px rgba(232, 121, 160, 0.25);
    }

    :host-context([data-theme="dark"]) .fav-btn {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(232, 121, 160, 0.25);
      color: rgba(232, 121, 160, 0.45);
    }

    :host-context([data-theme="dark"]) .fav-btn.is-fav {
      color: rgba(232, 121, 160, 1);
      background: rgba(232, 121, 160, 0.15);
      border-color: rgba(232, 121, 160, 0.5);
      box-shadow: 0 2px 8px rgba(232, 121, 160, 0.3);
    }
  `],
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
