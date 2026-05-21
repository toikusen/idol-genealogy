import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SwPush } from '@angular/service-worker';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private swPush = inject(SwPush);
  private supabase = inject(SupabaseService);
  private platformId = inject(PLATFORM_ID);

  private get db() { return this.supabase.client; }

  isSupported(): boolean {
    return isPlatformBrowser(this.platformId) && this.swPush.isEnabled;
  }

  get permission(): NotificationPermission | 'default' {
    if (!isPlatformBrowser(this.platformId)) return 'default';
    return Notification.permission;
  }

  async subscribe(): Promise<void> {
    if (!this.isSupported()) throw new Error('Push not supported');
    const session = await this.supabase.getSessionOnce();
    if (!session) throw new Error('Not logged in');

    const sub = await this.swPush.requestSubscription({
      serverPublicKey: environment.vapidPublicKey,
    });

    const json = sub.toJSON();
    await this.db.from('push_subscriptions').upsert({
      user_id: session.user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.['p256dh'] ?? '',
      auth_key: json.keys?.['auth'] ?? '',
    }, { onConflict: 'user_id,endpoint' });
  }

  async unsubscribe(): Promise<void> {
    if (!this.isSupported()) return;
    const session = await this.supabase.getSessionOnce();
    if (!session) return;

    const sub = await this.swPush.subscription.toPromise();
    if (!sub) return;

    await sub.unsubscribe();
    await this.db.from('push_subscriptions')
      .delete()
      .eq('user_id', session.user.id)
      .eq('endpoint', sub.endpoint);
  }
}
