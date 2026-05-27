import { Component, OnInit, signal, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PushNotificationService } from '../../core/push-notification.service';
import { NotificationPrefsService } from '../../core/notification-prefs.service';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationPrefs } from '../../models';

@Component({
  selector: 'app-push-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:20px;max-width:480px;">
      <div style="font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);margin-bottom:16px;">推播通知設定</div>

      @if (!pushService.isSupported()) {
        <div style="padding:16px;background:rgba(253,224,71,0.1);border:1px solid rgba(253,224,71,0.5);border-radius:12px;font-size:0.85rem;color:var(--text-primary);line-height:1.6;">
          📲 推播通知需在<strong>安裝後的 App</strong> 中開啟。<br>
          iOS 請用 Safari 開啟，點「分享」→「加入主畫面」後再設定（需 iOS 16.4+）。<br>
          Android 請用 Chrome 開啟，點「安裝應用程式」後再設定。
        </div>
      } @else {
        <!-- Permission row -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border-default);border-radius:16px;margin-bottom:10px;">
          <div>
            <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">推播通知</div>
            <div style="font-size:0.78rem;color:var(--text-faint-55);margin-top:3px;">{{ permissionLabel() }}</div>
          </div>
          @if (pushService.isSubscribed()) {
            <button (click)="unsubscribe()" [disabled]="loading()"
              style="font-size:0.8rem;padding:6px 14px;border-radius:10px;border:1px solid rgba(232,121,160,0.3);background:transparent;cursor:pointer;color:var(--text-faint-75);font-family:var(--font-sans);">
              {{ loading() ? '處理中…' : '取消訂閱' }}
            </button>
          } @else if (permission() !== 'denied') {
            <button (click)="subscribe()" [disabled]="loading()"
              style="font-size:0.8rem;padding:6px 14px;border-radius:10px;border:none;background:rgba(232,121,160,1);color:white;cursor:pointer;font-family:var(--font-sans);font-weight:600;">
              {{ loading() ? '處理中…' : '開啟通知' }}
            </button>
          }
        </div>

        @if (error()) {
          <div style="margin-bottom:10px;font-size:0.78rem;color:rgba(192,80,128,0.8);">{{ error() }}</div>
        }

        <!-- Notification type preferences -->
        <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:16px;padding:4px 18px 16px;">
          <div style="font-size:0.68rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-faint-40);padding-top:14px;margin-bottom:4px;">選擇要接收的通知類型</div>

          <!-- 活動通知 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.10);">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">活動通知</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">演唱會、見面會等新活動</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_event"
                (change)="toggle('notify_event', $event)"
                aria-label="活動通知"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_event ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_event ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          <!-- 新增歌曲 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.10);">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">新增歌曲</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">發布新歌或 MV</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_new_song"
                (change)="toggle('notify_new_song', $event)"
                aria-label="新增歌曲通知"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_new_song ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_new_song ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          <!-- 狀態異動 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.10);">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">狀態異動</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">畢業、退出、休息、復歸</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_status"
                (change)="toggle('notify_status', $event)"
                aria-label="狀態異動通知"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_status ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_status ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          <!-- 生日提醒 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.10);">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">生日提醒</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">最愛成員的生日當天</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_birthday"
                (change)="toggle('notify_birthday', $event)"
                aria-label="生日提醒通知"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_birthday ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_birthday ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          <!-- 解散公告 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="9" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 5-5h2"/><circle cx="17" cy="7" r="3"/><path d="M13 21v-2a5 5 0 0 1 5-5h0"/><line x1="5" y1="19" x2="21" y2="5"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">解散公告</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">最愛的團體發布解散消息</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_disbanded"
                (change)="toggle('notify_disbanded', $event)"
                aria-label="解散公告通知"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_disbanded ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_disbanded ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          @if (permission() !== 'granted') {
            <div style="margin-top:12px;color:var(--text-faint-40);display:flex;align-items:flex-start;gap:6px;line-height:1.55;font-size:0.74rem;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--text-faint-40)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              開啟推播通知後，以上設定才會生效。
            </div>
          }
        </div>
      }

      <!-- Install tip -->
      <div style="margin-top:12px;padding:14px 16px;background:rgba(147,197,253,0.08);border:1px solid rgba(147,197,253,0.25);border-radius:10px;font-size:0.82rem;color:var(--text-faint-75);line-height:1.7;">
        📱 <strong>iOS</strong>：Safari →「分享」→「加入主畫面」（iOS 16.4+）<br>
        🤖 <strong>Android</strong>：Chrome →「安裝應用程式」
      </div>
    </div>
  `,
})
export class PushSettingsComponent implements OnInit {
  readonly pushService = inject(PushNotificationService);
  readonly prefsService = inject(NotificationPrefsService);
  private supabase = inject(SupabaseService);
  private platformId = inject(PLATFORM_ID);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly _permission = signal<NotificationPermission | 'default'>('default');

  async ngOnInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      this._permission.set(Notification.permission);
    }
    const session = await this.supabase.getSessionOnce();
    if (session) {
      await this.prefsService.load(session.user.id);
    }
    await this.pushService.checkSubscription();
  }

  permission(): NotificationPermission | 'default' {
    return this._permission();
  }

  permissionLabel(): string {
    const p = this.permission();
    return p === 'granted' ? '已開啟' : p === 'denied' ? '已封鎖（請至瀏覽器設定開啟）' : '尚未開啟';
  }

  async toggle(key: keyof NotificationPrefs, event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    try {
      await this.prefsService.save(key, checked);
    } catch {
      this.error.set('儲存設定失敗，請稍後再試');
    }
  }

  async subscribe(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.pushService.subscribe();
      if (isPlatformBrowser(this.platformId)) {
        this._permission.set(Notification.permission);
      }
    } catch (e: any) {
      this.error.set(e?.message ?? '訂閱失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  async unsubscribe(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.pushService.unsubscribe();
    } catch (e: any) {
      this.error.set(e?.message ?? '取消失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }
}
