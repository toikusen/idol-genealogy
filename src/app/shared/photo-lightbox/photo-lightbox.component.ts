import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  ElementRef,
  HostListener,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseImgPipe } from '../supabase-img.pipe';

@Component({
  selector: 'app-photo-lightbox',
  standalone: true,
  imports: [SupabaseImgPipe],
  templateUrl: './photo-lightbox.component.html',
  styleUrl: './photo-lightbox.component.css',
})
export class PhotoLightboxComponent implements OnChanges, OnDestroy {
  @Input() photoUrl: string | null = null;
  @Input() name: string = '';
  @Input() open: boolean = false;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('closeBtn') closeBtnRef!: ElementRef<HTMLButtonElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private _savedOverflow = '';
  private _scrollLocked = false;
  private _triggerEl: HTMLElement | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (changes['open']) {
      if (this.open) {
        this._triggerEl = document.activeElement as HTMLElement;
        this.lockScroll();
        setTimeout(() => this.closeBtnRef?.nativeElement.focus(), 0);
      } else {
        this.unlockScroll();
        this._triggerEl?.focus();
        this._triggerEl = null;
      }
    }
  }

  close(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.open) this.close();
  }

  stopProp(event: MouseEvent): void {
    event.stopPropagation();
  }

  private lockScroll(): void {
    if (this._scrollLocked) return;
    this._savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this._scrollLocked = true;
  }

  private unlockScroll(): void {
    if (!this._scrollLocked) return;
    document.body.style.overflow = this._savedOverflow;
    this._scrollLocked = false;
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.unlockScroll();
    }
  }
}
