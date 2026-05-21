import { Component, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-push-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:20px;max-width:480px;">
      <div style="font-size:0.55rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);margin-bottom:16px;">推播通知設定</div>

      @if (!pushSupported()) {
        <div style="padding:16px;background:rgba(253,224,71,0.1);border:1px solid rgba(253,224,71,0.5);border-radius:12px;font-size:0.72rem;color:var(--text-primary);line-height:1.6;">
          ⚠️ 你的瀏覽器不支援推播通知。<br>
          iOS 用戶請先<strong>「加入主畫面」</strong>後再開啟通知（需 iOS 16.4+）。
        </div>
      }

      @if (pushSupported()) {
        <div style="padding:16px;background:rgba(232,121,160,0.06);border:1px solid rgba(232,121,160,0.2);border-radius:12px;font-size:0.72rem;color:var(--text-primary);line-height:1.6;">
          🔔 推播通知功能即將推出，敬請期待！<br>
          <span style="color:var(--text-faint-55);font-size:0.65rem;">（本功能將在下個版本上線）</span>
        </div>
      }

      <div style="margin-top:16px;padding:12px 14px;background:rgba(147,197,253,0.08);border:1px solid rgba(147,197,253,0.25);border-radius:10px;font-size:0.65rem;color:var(--text-faint-75);line-height:1.7;">
        📱 <strong>iOS 推播通知說明</strong><br>
        1. 在 Safari 開啟本網站<br>
        2. 點「分享」→「加入主畫面」<br>
        3. 從主畫面開啟後，即可在此啟用推播
      </div>
    </div>
  `,
})
export class PushSettingsComponent {
  private platformId = inject(PLATFORM_ID);

  pushSupported(): boolean {
    return isPlatformBrowser(this.platformId)
      && 'PushManager' in window
      && 'serviceWorker' in navigator;
  }
}
