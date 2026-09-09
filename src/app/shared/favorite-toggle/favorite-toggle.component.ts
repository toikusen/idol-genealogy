import { Component, Input, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { PushOptInService } from '../../core/push-opt-in.service';
import { SupabaseService } from '../../core/supabase.service';
import { FavoriteEntityType } from '../../models';

@Component({
  selector: 'app-favorite-toggle',
  standalone: true,
  template: `
    <div class="fav-wrap">
      <button
        (click)="toggle()"
        [attr.aria-label]="isFav() ? '取消最愛' : '加入最愛'"
        [class.is-fav]="isFav()"
        [disabled]="loading()"
        class="fav-btn"
      >
        {{ isFav() ? '♥' : '♡' }}
      </button>
      @if (errorMessage()) {
        <span class="fav-error" role="status">{{ errorMessage() }}</span>
      }
    </div>
  `,
  styles: [`
    .fav-wrap {
      position: relative;
      display: inline-block;
    }

    .fav-btn {
      width: 44px;
      height: 44px;
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

    .fav-error {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      white-space: nowrap;
      font-size: 0.7rem;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(200, 70, 70, 0.92);
      color: #fff;
      z-index: 5;
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
export class FavoriteToggleComponent implements OnDestroy {
  @Input({ required: true }) entityType!: FavoriteEntityType;
  @Input({ required: true }) entityId!: string;

  private favService = inject(FavoritesService);
  private pushOptIn = inject(PushOptInService);
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  private errorTimer?: ReturnType<typeof setTimeout>;

  isFav(): boolean {
    return this.favService.isFavorite(this.entityType, this.entityId);
  }

  async toggle(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set('');

    // Anonymous visitors are most of the traffic, so the heart is always rendered.
    // ponytail: the favourite is not carried through the login round-trip — it is one
    // extra tap on the page they land back on, not worth a pending-favourite store.
    if (!this.favService.isSignedIn() && !(await this.resumeSession())) {
      this.loading.set(false);
      void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    const wasFav = this.isFav();
    let added = false;
    try {
      if (wasFav) {
        await this.favService.remove(this.entityType, this.entityId);
      } else {
        await this.favService.add(this.entityType, this.entityId);
        added = true;
      }
    } catch {
      // Service already rolls back the optimistic update; just surface feedback.
      this.showError(wasFav ? '移除最愛失敗，請重試' : '加入最愛失敗，請重試');
    } finally {
      this.loading.set(false);
    }

    // Deliberately outside the try: favouriting already succeeded, and a failure in this
    // add-on must never be reported as "加入最愛失敗". Favouriting is the strongest signal
    // of "tell me about this" we ever get, so it is the best moment to ask.
    if (added) this.pushOptIn.offer(this.entityType);
  }

  /**
   * The heart ships in prerendered HTML, but FavoritesService is lazy-loaded and only
   * learns the user id once its first query is away — so "no user yet" is not proof of
   * anonymity. Returns true when a real session exists, adopting it for this tap.
   */
  private async resumeSession(): Promise<boolean> {
    const session = await this.supabase.getSessionOnce().catch(() => null);
    if (!session) return false;
    // load() claims the user id before it queries, so even a failed load can still write.
    await this.favService.load(session.user.id).catch(() => {});
    return true;
  }

  private showError(message: string): void {
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorMessage.set(message);
    this.errorTimer = setTimeout(() => this.errorMessage.set(''), 3000);
  }

  ngOnDestroy(): void {
    if (this.errorTimer) clearTimeout(this.errorTimer);
  }
}
