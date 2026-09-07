import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PushNotificationService } from './push-notification.service';
import { FavoriteEntityType } from '../models';

const SNOOZE_KEY = 'push_optin_snooze_until';
const ASK_COUNT_KEY = 'push_optin_asks';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ASKS = 3;

const SUBJECT: Record<FavoriteEntityType, string> = {
  group: '這個團體',
  member: '這位成員',
};

/**
 * Owns when and how we ask for notification permission.
 *
 * The browser's permission dialog is a one-shot: a user who dismisses a dialog they did not
 * expect leaves permission at 'denied', and no amount of app code can ever re-open it. So
 * the dialog is only ever raised from an explicit "yes" in our own UI — never automatically
 * on page load — and a "not now" only snoozes our own prompt.
 */
@Injectable({ providedIn: 'root' })
export class PushOptInService {
  private push = inject(PushNotificationService);
  private platformId = inject(PLATFORM_ID);

  /** What the visible prompt is offering notifications for; null while hidden. */
  readonly subject = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  shouldOffer(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    // 'denied' is unrecoverable from JS — nagging cannot help and only annoys.
    if (this.push.permission === 'denied') return false;
    if (this.push.isSubscribed()) return false;
    if (this.askCount() >= MAX_ASKS) return false;
    return Date.now() >= this.snoozeUntil();
  }

  /** Shows the soft prompt, if this is a good moment to ask. Safe to call unconditionally. */
  offer(type?: FavoriteEntityType): void {
    if (this.busy()) return;
    if (!this.shouldOffer()) return;
    // Favouriting three things in a row must cost one ask, not three: the user only ever
    // saw one prompt. Count the open, not the call.
    const alreadyOpen = this.subject() !== null;
    this.error.set('');
    this.subject.set(type ? SUBJECT[type] : '你收藏的團體');
    if (!alreadyOpen) this.write(ASK_COUNT_KEY, String(this.askCount() + 1));
  }

  /** True when this platform cannot subscribe yet — iOS before 「加入主畫面」. */
  needsInstall(): boolean {
    return !this.push.isSupported();
  }

  /** Raises the real permission dialog. Only ever called from a user gesture. */
  async accept(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.push.subscribe();
      this.subject.set(null);
    } catch (e: any) {
      this.error.set(e?.message ?? '開啟失敗，請稍後再試');
    } finally {
      this.busy.set(false);
    }
  }

  dismiss(): void {
    this.write(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    this.subject.set(null);
  }

  private askCount(): number {
    return Number(this.read(ASK_COUNT_KEY) ?? 0) || 0;
  }

  private snoozeUntil(): number {
    return Number(this.read(SNOOZE_KEY) ?? 0) || 0;
  }

  // Storage is unavailable in private mode and when site data is blocked; degrade to
  // "ask this session only" rather than throwing.
  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ponytail: nothing to do — the prompt just reappears next session
    }
  }
}
