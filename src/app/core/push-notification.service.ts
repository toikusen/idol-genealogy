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

  private isPwa(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  }

  isSupported(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return this.swPush.isEnabled && this.isPwa();
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

    const json = sub.toJSON();
    const { error: upsertError } = await this.db.from('push_subscriptions').upsert({
      user_id: session.user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.['p256dh'] ?? '',
      auth_key: json.keys?.['auth'] ?? '',
    }, { onConflict: 'user_id,endpoint' });
    if (upsertError) throw new Error(upsertError.message);
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
