import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { SukigaoCandidate } from '../../models';
import { SITE_URL } from '../../core/public-url.utils';
import { renderShareImage } from './sukigao-share-image';

export type SukigaoSubmitState = 'idle' | 'sending' | 'done' | 'error';
export type SukigaoShareMethod = 'web_share' | 'facebook' | 'threads' | 'image_share' | 'image_download';

export const SUKIGAO_SHARE_URL = `${SITE_URL}/sukigao`;

const MEDALS = ['🥇', '🥈', '🥉'];
const IMAGE_FILE_NAME = 'idolmaps-顏控9選.png';
/** On <body> while the image dialog is open: stops the page behind it scrolling. */
export const MODAL_OPEN_CLASS = 'sukigao-modal-open';

/** Share text without the URL (Threads and Web Share take the URL separately). */
export function buildShareText(names: readonly string[]): string {
  const lines = names.map((name, i) => (i < 3 ? `${MEDALS[i]} ${name}` : `${i + 1}. ${name}`));
  return ['我的「台灣地偶顏控9選」💗', ...lines, '#IdolMaps', '#台灣地偶顏控9選'].join('\n');
}

/** Threads' web intent takes prefilled text; the URL goes in its own param. */
export function buildThreadsShareUrl(names: readonly string[]): string {
  return `https://www.threads.net/intent/post?text=${encodeURIComponent(buildShareText(names))}`
    + `&url=${encodeURIComponent(SUKIGAO_SHARE_URL)}`;
}

/** Facebook ignores prefilled text; the sharer only takes the link (its OG card). */
export function buildFacebookShareUrl(): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SUKIGAO_SHARE_URL)}`;
}

type ImageState = 'idle' | 'rendering' | 'ready' | 'error';

@Component({
  selector: 'app-sukigao-result',
  standalone: true,
  imports: [RouterLink, SupabaseImgPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sukigao-result.component.html',
  styleUrls: ['./sukigao-buttons.css', './sukigao-result.component.css'],
})
export class SukigaoResultComponent implements OnDestroy {
  @Input({ required: true }) faces: SukigaoCandidate[] = [];
  @Input() submitState: SukigaoSubmitState = 'idle';
  @Input() replaced = false;
  @Input() canUndo = false;
  @Output() submitResult = new EventEmitter<void>();
  @Output() restart = new EventEmitter<void>();
  @Output() undo = new EventEmitter<void>();
  @Output() shared = new EventEmitter<SukigaoShareMethod>();
  @ViewChild('imageDialog') private imageDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('imageTrigger') private imageTrigger?: ElementRef<HTMLButtonElement>;

  readonly medals = MEDALS;
  readonly facebookUrl = buildFacebookShareUrl();

  toast = '';
  imageState: ImageState = 'idle';
  imageUrl: string | null = null;
  canShareImage = false;
  private imageBlob: Blob | null = null;
  private imageBlobFile: File | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (typeof document !== 'undefined') document.body.classList.remove(MODAL_OPEN_CLASS);
  }

  get names(): string[] {
    return this.faces.map(f => f.name);
  }

  get threadsUrl(): string {
    return buildThreadsShareUrl(this.names);
  }

  get canWebShare(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }

  groupLabel(face: SukigaoCandidate): string {
    return face.groupNames.length > 0 ? face.groupNames.join('・') : 'Solo';
  }

  /** Native share sheet (LINE, Instagram…); falls back to copying the text. */
  async shareMore(): Promise<void> {
    const text = buildShareText(this.names);
    if (this.canWebShare) {
      try {
        await navigator.share({ title: '我的台灣地偶顏控9選', text, url: SUKIGAO_SHARE_URL });
        this.shared.emit('web_share');
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    await this.copyText();
  }

  /**
   * Facebook drops prefilled text, so copy the TOP 9 first — the player just
   * pastes it into the post the sharer opens. The link itself is the <a href>.
   */
  async onFacebook(): Promise<void> {
    const ok = await this.copyText(false);
    this.showToast(ok ? '已複製你的 TOP9，貼到 Facebook 貼文裡即可 ✨' : '分享視窗已開啟');
    this.shared.emit('facebook');
  }

  onThreads(): void {
    this.shared.emit('threads');
  }

  // ── result image ──

  async openImage(): Promise<void> {
    if (this.imageState === 'rendering') return;
    if (this.imageState === 'ready') return;
    this.imageState = 'rendering';
    this.cdr.markForCheck();
    try {
      const blob = await renderShareImage(this.faces, 'idolmaps.com/sukigao');
      this.imageBlob = blob;
      this.imageBlobFile = null;
      this.canShareImage = this.checkCanShareImage();
      if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = URL.createObjectURL(blob);
      this.imageState = 'ready';
    } catch {
      this.imageState = 'error';
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
    const dialog = this.imageDialog?.nativeElement;
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
      document.body.classList.add(MODAL_OPEN_CLASS);
      dialog.showModal();
    }
  }

  closeImage(): void {
    const dialog = this.imageDialog?.nativeElement;
    if (dialog?.open) dialog.close(); // → (close) → onDialogClosed()
    else this.onDialogClosed();
  }

  /** Runs for every way the dialog closes: 關閉, Esc, a tap on the backdrop. */
  onDialogClosed(): void {
    document.body.classList.remove(MODAL_OPEN_CLASS);
    this.imageState = 'idle';
    if (this.imageUrl) {
      URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = null;
    }
    this.imageBlob = null;
    this.imageBlobFile = null;
    this.canShareImage = false;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
    this.imageTrigger?.nativeElement.focus();
  }

  /** A click whose target is the <dialog> itself landed on the backdrop, outside the panel. */
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.imageDialog?.nativeElement) this.closeImage();
  }

  private get imageFile(): File | null {
    if (!this.imageBlob) return null;
    this.imageBlobFile ??= new File([this.imageBlob], IMAGE_FILE_NAME, { type: 'image/png' });
    return this.imageBlobFile;
  }

  private checkCanShareImage(): boolean {
    const file = this.imageFile;
    if (!file || typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }

  /** Phones: share sheet with the PNG (「儲存影像」, Instagram, Threads…). */
  async shareImage(): Promise<void> {
    const file = this.imageFile;
    if (!file) return;
    try {
      await navigator.share({
        files: [file],
        title: '我的台灣地偶顏控9選',
        text: `${buildShareText(this.names)}\n${SUKIGAO_SHARE_URL}`,
      });
      this.shared.emit('image_share');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      this.downloadImage();
    }
  }

  downloadImage(): void {
    if (!this.imageUrl || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = this.imageUrl;
    a.download = IMAGE_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.shared.emit('image_download');
  }

  // ── helpers ──

  private async copyText(announce = true): Promise<boolean> {
    const text = `${buildShareText(this.names)}\n${SUKIGAO_SHARE_URL}`;
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = legacyCopy(text);
    if (announce) this.showToast(ok ? '已複製結果文字' : '無法自動複製，請手動截圖');
    return ok;
  }

  private showToast(message: string): void {
    this.toast = message;
    this.cdr.markForCheck();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = '';
      this.cdr.markForCheck();
    }, 3500);
  }
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(el);
  return ok;
}
