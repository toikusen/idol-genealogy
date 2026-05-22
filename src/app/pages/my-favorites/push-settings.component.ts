import { Component, OnInit, signal, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PushNotificationService } from '../../core/push-notification.service';

@Component({
  selector: 'app-push-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:20px;max-width:480px;">
      <div style="font-size:0.55rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);margin-bottom:16px;">推播通知設定</div>

      @if (!pushService.isSupported()) {
        <div style="padding:16px;background:rgba(253,224,71,0.1);border:1px solid rgba(253,224,71,0.5);border-radius:12px;font-size:0.72rem;color:var(--text-primary);line-height:1.6;">
          ⚠️ 你的環境不支援推播通知。<br>
          iOS 用戶請先<strong>「加入主畫面」</strong>後開啟（需 iOS 16.4+）。
        </div>
      } @else {
        <!-- Permission status -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.08);">
          <div>
            <div style="font-size:0.72rem;font-weight:600;color:var(--text-primary);">推播通知</div>
            <div style="font-size:0.6rem;color:var(--text-faint-55);margin-top:2px;">
              {{ permissionLabel() }}
            </div>
          </div>
          @if (permission() === 'granted') {
            <button (click)="unsubscribe()" [disabled]="loading()"
              style="font-size:0.65rem;padding:5px 12px;border-radius:10px;border:1px solid rgba(232,121,160,0.3);background:transparent;cursor:pointer;color:var(--text-faint-75);">
              {{ loading() ? '處理中…' : '取消訂閱' }}
            </button>
          } @else {
            <button (click)="subscribe()" [disabled]="loading()"
              style="font-size:0.65rem;padding:5px 12px;border-radius:10px;border:none;background:rgba(232,121,160,1);color:white;cursor:pointer;">
              {{ loading() ? '處理中…' : '開啟通知' }}
            </button>
          }
        </div>

        @if (error()) {
          <div style="margin-top:10px;font-size:0.65rem;color:rgba(192,80,128,0.8);">{{ error() }}</div>
        }

        <div style="margin-top:16px;font-size:0.65rem;color:var(--text-faint-55);line-height:1.8;">
          開啟後，當最愛的團體或成員發生以下事件時將收到通知：<br>
          📅 新增活動　🎵 新增歌曲　⚡ 成員狀態異動
        </div>
      }

      <!-- iOS tip -->
      <div style="margin-top:16px;padding:12px 14px;background:rgba(147,197,253,0.08);border:1px solid rgba(147,197,253,0.25);border-radius:10px;font-size:0.65rem;color:var(--text-faint-75);line-height:1.7;">
        📱 <strong>iOS 推播說明</strong>：需使用 Safari 開啟，並「加入主畫面」後才能啟用推播（iOS 16.4+）。
      </div>
    </div>
  `,
})
export class PushSettingsComponent implements OnInit {
  readonly pushService = inject(PushNotificationService);
  private platformId = inject(PLATFORM_ID);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly _permission = signal<NotificationPermission | 'default'>('default');

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this._permission.set(Notification.permission);
    }
  }

  permission(): NotificationPermission | 'default' {
    return this._permission();
  }

  permissionLabel(): string {
    const p = this.permission();
    return p === 'granted' ? '已開啟' : p === 'denied' ? '已封鎖（請至瀏覽器設定開啟）' : '尚未開啟';
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
      if (isPlatformBrowser(this.platformId)) {
        this._permission.set(Notification.permission);
      }
    } catch (e: any) {
      this.error.set(e?.message ?? '取消失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }
}
