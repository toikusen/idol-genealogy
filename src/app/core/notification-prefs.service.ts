import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { NotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from '../models';

@Injectable({ providedIn: 'root' })
export class NotificationPrefsService {
  private readonly _prefs = signal<NotificationPrefs>({ ...DEFAULT_NOTIFICATION_PREFS });
  private _userId: string | null = null;
  private _loaded = false;

  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  prefs(): NotificationPrefs {
    return this._prefs();
  }

  async load(userId: string): Promise<void> {
    if (this._loaded && this._userId === userId) return;
    this._userId = userId;
    const { data } = await this.db
      .from('push_notification_prefs')
      .select('notify_event,notify_new_song,notify_status,notify_birthday,notify_disbanded')
      .eq('user_id', userId)
      .maybeSingle();
    this._prefs.set(data ?? { ...DEFAULT_NOTIFICATION_PREFS });
    this._loaded = true;
  }

  async save(key: keyof NotificationPrefs, value: boolean): Promise<void> {
    if (!this._userId) return;
    const updated: NotificationPrefs = { ...this._prefs(), [key]: value };
    this._prefs.set(updated);
    await this.db.from('push_notification_prefs').upsert(
      { user_id: this._userId, ...updated, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }

  reset(): void {
    this._prefs.set({ ...DEFAULT_NOTIFICATION_PREFS });
    this._userId = null;
    this._loaded = false;
  }
}
