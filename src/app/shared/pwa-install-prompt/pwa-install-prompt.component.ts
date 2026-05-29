import {
  Component, OnInit, signal, PLATFORM_ID, inject,
  DestroyRef, ElementRef, viewChild, effect,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

type InstallMode = 'android' | 'ios' | null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Component({
  selector: 'app-pwa-install-prompt',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './pwa-install-prompt.component.html',
  styleUrl: './pwa-install-prompt.component.css',
  host: { '(keydown.escape)': 'dismiss()' },
})
export class PwaInstallPromptComponent implements OnInit {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = signal(false);
  readonly mode = signal<InstallMode>(null);
  readonly installing = signal(false);
  dismissToday = false;

  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  constructor() {
    // Focus close button whenever sheet opens for keyboard/AT users
    effect(() => {
      if (this.visible()) {
        // One tick delay to let @if render the DOM
        setTimeout(() => this.closeBtn()?.nativeElement.focus(), 50);
      }
    });
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;
    if (this.isDismissedToday()) return;
    if (this.isStandalone()) return;
    if (!this.isMobile()) return;

    if (this.isIos()) {
      this.mode.set('ios');
      this.scheduleShow();
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.mode.set('android');
      this.scheduleShow();
    };

    window.addEventListener('beforeinstallprompt', handler, { once: true });
    // Remove listener if component is destroyed before event fires
    this.destroyRef.onDestroy(() =>
      window.removeEventListener('beforeinstallprompt', handler),
    );
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt || this.installing()) return;
    this.installing.set(true);
    try {
      await this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      // Close sheet regardless of outcome — prompt can only be used once
      this.dismiss();
    } finally {
      this.deferredPrompt = null;
      this.installing.set(false);
    }
  }

  dismiss(): void {
    if (this.dismissToday) {
      localStorage.setItem('pwa_dismiss_date', new Date().toDateString());
    }
    this.visible.set(false);
  }

  private scheduleShow(): void {
    this.timerId = setTimeout(() => this.visible.set(true), 1200);
    this.destroyRef.onDestroy(() => {
      if (this.timerId !== null) clearTimeout(this.timerId);
    });
  }

  private isDismissedToday(): boolean {
    const stored = localStorage.getItem('pwa_dismiss_date');
    return stored === new Date().toDateString();
  }

  private isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  private isMobile(): boolean {
    return window.innerWidth < 768;
  }

  private isIos(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
      && !/crios|fxios|opios|mercury/i.test(navigator.userAgent);
  }
}
