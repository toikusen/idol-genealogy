import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { PushOptInService } from '../../core/push-opt-in.service';

@Component({
  selector: 'app-push-opt-in-prompt',
  standalone: true,
  host: { '(keydown.escape)': 'optIn.dismiss()' },
  template: `
    @if (optIn.subject(); as subject) {
      <div class="po-backdrop" (click)="optIn.dismiss()" aria-hidden="true"></div>

      <div class="po-sheet" role="dialog" aria-modal="true" aria-labelledby="po-title">
        <div class="po-header">
          <div class="po-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <div>
            <p id="po-title" class="po-title">要收到新活動通知嗎？</p>
            <p class="po-subtitle">{{ subject }}發布演唱會、見面會時第一時間告訴你</p>
          </div>
        </div>

        @if (optIn.needsInstall()) {
          <p class="po-install">
            通知需要先把網站加到主畫面：<br>
            <strong>iOS</strong>　Safari →「分享」→「加入主畫面」（需 iOS 16.4+）<br>
            <strong>Android</strong>　Chrome →「安裝應用程式」
          </p>
          <button #primaryBtn class="po-btn po-btn--ghost" (click)="optIn.dismiss()">知道了</button>
        } @else {
          @if (optIn.error()) {
            <p class="po-error" role="status">{{ optIn.error() }}</p>
          }
          <button #primaryBtn class="po-btn" [disabled]="optIn.busy()" (click)="optIn.accept()">
            {{ optIn.busy() ? '開啟中…' : '好，開啟通知' }}
          </button>
          <button class="po-btn po-btn--ghost" [disabled]="optIn.busy()" (click)="optIn.dismiss()">
            以後再說
          </button>
        }
      </div>
    }
  `,
  styles: [`
    .po-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(2px);
      z-index: 999;
    }

    .po-sheet {
      position: fixed;
      left: 50%;
      bottom: max(16px, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      width: min(420px, calc(100vw - 24px));
      z-index: 1000;
      padding: 20px;
      border-radius: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
    }

    .po-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
    }

    .po-icon {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(232, 121, 160, 0.12);
      color: rgba(232, 121, 160, 1);
    }

    .po-title {
      margin: 0 0 3px;
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .po-subtitle {
      margin: 0;
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--text-faint-55);
    }

    .po-install {
      margin: 0 0 14px;
      font-size: 0.8rem;
      line-height: 1.75;
      color: var(--text-faint-75);
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(147, 197, 253, 0.08);
      border: 1px solid rgba(147, 197, 253, 0.25);
    }

    .po-error {
      margin: 0 0 10px;
      font-size: 0.78rem;
      color: rgba(192, 80, 128, 0.9);
    }

    .po-btn {
      width: 100%;
      padding: 11px;
      border: none;
      border-radius: 12px;
      font-family: var(--font-sans);
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      background: rgba(232, 121, 160, 1);
      color: #fff;
    }

    .po-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }

    .po-btn--ghost {
      margin-top: 8px;
      background: transparent;
      color: var(--text-faint-55);
      font-weight: 500;
      border: 1px solid var(--border-default);
    }
  `],
})
export class PushOptInPromptComponent {
  readonly optIn = inject(PushOptInService);

  private readonly primaryBtn = viewChild<ElementRef<HTMLButtonElement>>('primaryBtn');

  constructor() {
    // aria-modal="true" is a promise that focus lives inside the dialog. Without moving it
    // there the sheet is unreachable by keyboard and the escape binding never fires,
    // because the host element never holds focus.
    effect(() => {
      if (this.optIn.subject()) {
        // One tick so @if has rendered the button.
        setTimeout(() => this.primaryBtn()?.nativeElement.focus(), 50);
      }
    });
  }
}
