import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { SukigaoCandidate } from '../../models';
import { SITE_URL } from '../../core/public-url.utils';

export type SukigaoSubmitState = 'idle' | 'sending' | 'done' | 'error';
export type SukigaoShareMethod = 'web_share' | 'x' | 'copy';

export const SUKIGAO_SHARE_URL = `${SITE_URL}/sukigao`;

const MEDALS = ['🥇', '🥈', '🥉'];

/** Share text without the URL (X and Web Share take the URL separately). */
export function buildShareText(names: readonly string[]): string {
  const lines = names.map((name, i) => (i < 3 ? `${MEDALS[i]} ${name}` : `${i + 1}. ${name}`));
  return ['我的「台灣地偶顏控9選」💗', ...lines, '#IdolMaps', '#台灣地偶顏控9選'].join('\n');
}

export function buildXShareUrl(names: readonly string[]): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(buildShareText(names))}`
    + `&url=${encodeURIComponent(SUKIGAO_SHARE_URL)}`;
}

@Component({
  selector: 'app-sukigao-result',
  standalone: true,
  imports: [RouterLink, SupabaseImgPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sukigao-result.component.html',
  styleUrls: ['./sukigao-buttons.css', './sukigao-result.component.css'],
})
export class SukigaoResultComponent {
  @Input({ required: true }) faces: SukigaoCandidate[] = [];
  @Input() submitState: SukigaoSubmitState = 'idle';
  @Input() replaced = false;
  @Input() canUndo = false;
  @Output() submitResult = new EventEmitter<void>();
  @Output() restart = new EventEmitter<void>();
  @Output() undo = new EventEmitter<void>();
  @Output() shared = new EventEmitter<SukigaoShareMethod>();

  copyStatus: 'idle' | 'copied' | 'failed' = 'idle';
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  get names(): string[] {
    return this.faces.map(f => f.name);
  }

  get xShareUrl(): string {
    return buildXShareUrl(this.names);
  }

  groupLabel(face: SukigaoCandidate): string {
    return face.groupNames.length > 0 ? face.groupNames.join('・') : 'Solo';
  }

  async share(): Promise<void> {
    const text = buildShareText(this.names);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: '我的台灣地偶顏控9選', text, url: SUKIGAO_SHARE_URL });
        this.shared.emit('web_share');
        return;
      } catch (err) {
        // User closed the share sheet: nothing to do.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    await this.copy();
  }

  async copy(): Promise<void> {
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
    this.copyStatus = ok ? 'copied' : 'failed';
    if (ok) this.shared.emit('copy');
    this.cdr.markForCheck();
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => {
      this.copyStatus = 'idle';
      this.cdr.markForCheck();
    }, 2500);
  }

  onShareX(): void {
    this.shared.emit('x');
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
