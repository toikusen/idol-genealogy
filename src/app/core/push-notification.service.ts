import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

const SUBSCRIBE_TIMEOUT_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private swPush = inject(SwPush);
  private supabase = inject(SupabaseService);
  private platformId = inject(PLATFORM_ID);

  readonly isSubscribed = signal(false);

  private get db() { return this.supabase.client; }

  isSupported(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    // iOS exposes Notification/PushManager only to a Home Screen web app, so this feature
    // check already enforces "install first" there without sniffing the UA — while not
    // locking Chrome (desktop and Android) out of a plain tab, where push does work.
    return this.swPush.isEnabled && typeof Notification !== 'undefined' && 'PushManager' in window;
  }

  get permission(): NotificationPermission | 'default' {
    if (!isPlatformBrowser(this.platformId)) return 'default';
    return Notification.permission;
  }

  async checkSubscription(): Promise<void> {
    if (!this.isSupported()) { this.isSubscribed.set(false); return; }
    const sub = await firstValueFrom(this.swPush.subscription);
    this.isSubscribed.set(!!sub);
  }

  /**
   * Repairs the stored subscription on app start. A push service expires endpoints on its
   * own schedule (Apple and FCM both do) and send-push-notification reaps the row on
   * 404/410 — correctly — but nothing used to put a fresh one back, so the device went
   * permanently silent while the settings page still reported "已開啟". Two cases:
   * the browser kept a subscription the DB no longer has (re-upsert it), or the browser
   * dropped it too (re-subscribe, silently, since permission is already granted).
   *
   * Never prompts: it bails out unless permission is already 'granted'.
   *
   * ponytail: repairs on app open, not the instant the endpoint rotates. Handling
   * `pushsubscriptionchange` in the worker would close that window, but ngsw does not
   * expose the event and a custom worker has no Supabase session to write with — it would
   * need an Edge Function that re-keys a row by its old endpoint. Only worth it if pushes
   * between rotation and next open turn out to matter.
   */
  async ensureSubscribed(): Promise<void> {
    if (!this.isSupported() || this.permission !== 'granted') return;
    try {
      const existing = await firstValueFrom(this.swPush.subscription);
      const sub = existing ?? await this.swPush.requestSubscription({
        serverPublicKey: environment.vapidPublicKey,
      });
      await this.saveSubscription(sub);
      this.isSubscribed.set(true);
    } catch {
      // ponytail: best-effort; the settings page still offers a manual re-subscribe
    }
  }

  private async saveSubscription(sub: PushSubscription): Promise<void> {
    const session = await this.supabase.getSessionOnce();
    if (!session) return;
    const json = sub.toJSON();
    const { error } = await this.db.from('push_subscriptions').upsert({
      user_id: session.user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.['p256dh'] ?? '',
      auth_key: json.keys?.['auth'] ?? '',
    }, { onConflict: 'user_id,endpoint' });
    if (error) throw new Error(error.message);
  }

  async subscribe(): Promise<void> {
    if (!this.isSupported()) throw new Error('Push not supported');
    const session = await this.supabase.getSessionOnce();
    if (!session) throw new Error('Not logged in');

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('訂閱逾時，請稍後再試')), SUBSCRIBE_TIMEOUT_MS),
    );

    const sub = await Promise.race([
      this.swPush.requestSubscription({ serverPublicKey: environment.vapidPublicKey }),
      timeout,
    ]);

    await this.saveSubscription(sub);
    this.isSubscribed.set(true);
  }

  async unsubscribe(): Promise<void> {
    if (!this.isSupported()) return;
    const session = await this.supabase.getSessionOnce();
    if (!session) return;

    const sub = await firstValueFrom(this.swPush.subscription);
    if (sub) {
      await sub.unsubscribe();
      await this.db.from('push_subscriptions')
        .delete()
        .eq('user_id', session.user.id)
        .eq('endpoint', sub.endpoint);
    }
    this.isSubscribed.set(false);
  }
}
