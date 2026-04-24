import { Component, Input, forwardRef, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { StorageService } from '../../core/storage.service';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png']);

const CIRCLE_R = 130;   // 顯示圓半徑 px
const CONTAINER = 300;  // 裁切框尺寸 px
const OUTPUT = 400;     // 輸出圖片尺寸 px

@Component({
  selector: 'app-photo-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => PhotoUploadComponent),
    multi: true,
  }],
  styles: [`
    @media (prefers-color-scheme: dark) {
      /* URL input */
      :host input[type="url"] {
        background: var(--bg-surface) !important;
        border-color: var(--border-default) !important;
        color: var(--text-primary) !important;
      }
      :host input[type="url"]::placeholder {
        color: var(--text-faint-45);
      }
      /* Upload button */
      :host .border-gray-200 {
        border-color: var(--border-default) !important;
      }
      :host .bg-gray-50 {
        background: var(--bg-card) !important;
      }
      /* Text */
      :host .text-gray-400 { color: var(--text-faint-45) !important; }
      :host .text-gray-500 { color: var(--text-faint-55) !important; }
      :host .text-gray-800 { color: var(--text-primary) !important; }
      /* Crop modal card */
      :host .bg-white {
        background: var(--bg-surface) !important;
        border: 1px solid var(--border-subtle);
      }
      /* Crop modal cancel button */
      :host button.border-gray-200 {
        border-color: var(--border-default) !important;
        color: var(--text-faint-55) !important;
      }
    }
  `],
  template: `
    <div class="space-y-2">

      <!-- 預覽 -->
      @if (url) {
        <div class="flex items-center gap-3">
          <img [src]="url" alt="預覽"
            class="w-14 h-14 rounded-full object-cover border border-gray-200 flex-shrink-0 bg-gray-50"/>
          <span class="text-xs text-gray-400 truncate flex-1 min-w-0">{{ url }}</span>
          <button type="button" (click)="clear()"
            class="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors p-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      }

      <!-- 上傳 + URL -->
      <div class="flex gap-2">
        <input #fileInput type="file" accept="image/jpeg,image/png" class="hidden"
          (change)="onFileSelect($event)"/>
        <button type="button" (click)="fileInput.click()"
          class="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-200 text-xs text-pink-500 hover:bg-pink-50 hover:border-pink-300 transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          上傳圖片
        </button>
        <input type="url" [ngModel]="url" (ngModelChange)="onUrlChange($event)"
          placeholder="或直接貼上 https://..."
          class="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"/>
      </div>
      <p class="text-xs text-gray-400">最大 5MB，支援 JPG / PNG</p>
      @if (error) {
        <p class="text-xs text-red-500">{{ error }}</p>
      }
    </div>

    <!-- 裁切 Modal -->
    @if (cropMode) {
      <div class="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-4 w-auto">

          <div class="text-center">
            <h3 class="text-sm font-semibold text-gray-800">調整圖片範圍</h3>
            <p class="text-xs text-gray-400 mt-0.5">拖動移動位置 · 滾輪或滑桿縮放</p>
          </div>

          <!-- 裁切區 -->
          <div #cropArea
            [style.width.px]="CONTAINER"
            [style.height.px]="CONTAINER"
            style="position:relative;overflow:hidden;border-radius:8px;background:#1a1a1a;cursor:grab;touch-action:none;flex-shrink:0;"
            (mousedown)="onMouseDown($event)"
            (mousemove)="onMouseMove($event)"
            (mouseup)="onMouseUp()"
            (mouseleave)="onMouseUp()"
            (touchstart)="onTouchStart($event)"
            (touchmove)="onTouchMove($event)"
            (touchend)="onMouseUp()">

            <!-- 圖片 -->
            <img #cropImg [src]="cropSrc"
              (load)="onImageLoad(cropImg)"
              draggable="false"
              [style.position]="'absolute'"
              [style.width.px]="naturalW * scale"
              [style.height.px]="naturalH * scale"
              [style.left.px]="CONTAINER/2 + offsetX - naturalW * scale / 2"
              [style.top.px]="CONTAINER/2 + offsetY - naturalH * scale / 2"
              style="user-select:none;pointer-events:none;"/>

            <!-- 暗色遮罩（圓形鏤空） -->
            <div style="position:absolute;inset:0;pointer-events:none;"
              [style.-webkit-mask]="circleMask"
              [style.mask]="circleMask"
              style="background:rgba(0,0,0,0.6);"></div>

            <!-- 圓形邊框 -->
            <div style="position:absolute;border-radius:50%;border:2px solid rgba(255,255,255,0.6);pointer-events:none;"
              [style.width.px]="CIRCLE_R*2"
              [style.height.px]="CIRCLE_R*2"
              [style.left.px]="CONTAINER/2 - CIRCLE_R"
              [style.top.px]="CONTAINER/2 - CIRCLE_R"></div>
          </div>

          <!-- 縮放滑桿 -->
          <div class="flex items-center gap-3 w-full px-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-400 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            <input type="range"
              [min]="minScale" [max]="minScale * 4" [step]="0.001"
              [ngModel]="scale" (ngModelChange)="onSliderChange($event)"
              class="flex-1 accent-pink-400"/>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-400 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </div>

          <!-- 按鈕 -->
          <div class="flex gap-3 w-full">
            <button type="button" (click)="cancelCrop()"
              class="flex-1 px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              取消
            </button>
            <button type="button" (click)="confirmCrop()" [disabled]="croppingUploading"
              class="flex-1 px-4 py-2 text-sm text-white bg-pink-500 hover:bg-pink-600 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5">
              @if (croppingUploading) {
                <svg class="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                上傳中…
              } @else {
                確認裁切
              }
            </button>
          </div>

          @if (cropError) {
            <p class="text-xs text-red-500">{{ cropError }}</p>
          }
        </div>
      </div>
    }
  `,
})
export class PhotoUploadComponent implements ControlValueAccessor, AfterViewChecked {
  @Input() folder: 'members' | 'groups' | 'companies' | 'team' = 'members';
  @ViewChild('cropArea') cropAreaRef?: ElementRef<HTMLDivElement>;

  readonly CIRCLE_R = CIRCLE_R;
  readonly CONTAINER = CONTAINER;

  url = '';
  error = '';

  // 裁切狀態
  cropMode = false;
  cropSrc = '';
  scale = 1;
  minScale = 1;
  offsetX = 0;
  offsetY = 0;
  naturalW = 0;
  naturalH = 0;
  croppingUploading = false;
  cropError = '';

  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastTouchDist = 0;
  private wheelListenerAdded = false;

  get circleMask(): string {
    return `radial-gradient(circle ${CIRCLE_R}px at 50% 50%, transparent ${CIRCLE_R - 1}px, black ${CIRCLE_R}px)`;
  }

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private storage: StorageService) {}

  ngAfterViewChecked() {
    if (this.cropMode && this.cropAreaRef && !this.wheelListenerAdded) {
      this.cropAreaRef.nativeElement.addEventListener('wheel', this.handleWheel, { passive: false });
      this.wheelListenerAdded = true;
    }
    if (!this.cropMode && this.wheelListenerAdded) {
      this.cropAreaRef?.nativeElement.removeEventListener('wheel', this.handleWheel);
      this.wheelListenerAdded = false;
    }
  }

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.93;
    this.scale = Math.max(this.minScale, Math.min(this.minScale * 4, this.scale * factor));
    this.clamp();
  };

  writeValue(v: string | null) { this.url = v ?? ''; }
  registerOnChange(fn: (v: string) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }

  onUrlChange(val: string) {
    this.url = val;
    this.error = '';
    this.onChange(val);
    this.onTouched();
  }

  clear() {
    this.url = '';
    this.error = '';
    this.onChange('');
    this.onTouched();
  }

  onFileSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (!file) return;
    if (file.size > MAX_SIZE) { this.error = '檔案大小不能超過 5MB'; return; }
    if (!ALLOWED.has(file.type)) { this.error = '僅支援 JPG、PNG 格式'; return; }
    this.error = '';
    this.cropError = '';
    const reader = new FileReader();
    reader.onload = (e) => {
      this.cropSrc = e.target?.result as string;
      this.cropMode = true;
    };
    reader.readAsDataURL(file);
  }

  onImageLoad(img: HTMLImageElement) {
    this.naturalW = img.naturalWidth;
    this.naturalH = img.naturalHeight;
    this.minScale = Math.max((CIRCLE_R * 2) / this.naturalW, (CIRCLE_R * 2) / this.naturalH);
    this.scale = this.minScale;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  onMouseDown(e: MouseEvent) {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    e.preventDefault();
  }

  onMouseMove(e: MouseEvent) {
    if (!this.dragging) return;
    this.offsetX += e.clientX - this.lastX;
    this.offsetY += e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.clamp();
  }

  onMouseUp() { this.dragging = false; }

  onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      this.dragging = true;
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      this.dragging = false;
      this.lastTouchDist = this.touchDist(e);
    }
  }

  onTouchMove(e: TouchEvent) {
    if (e.touches.length === 1 && this.dragging) {
      this.offsetX += e.touches[0].clientX - this.lastX;
      this.offsetY += e.touches[0].clientY - this.lastY;
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
      this.clamp();
    } else if (e.touches.length === 2) {
      const dist = this.touchDist(e);
      this.scale = Math.max(this.minScale, Math.min(this.minScale * 4, this.scale * (dist / this.lastTouchDist)));
      this.lastTouchDist = dist;
      this.clamp();
    }
  }

  onSliderChange(val: number) {
    this.scale = val;
    this.clamp();
  }

  cancelCrop() {
    this.cropMode = false;
    this.cropSrc = '';
  }

  async confirmCrop() {
    this.croppingUploading = true;
    this.cropError = '';
    try {
      const blob = await this.renderCrop();
      const uploaded = await this.storage.uploadCropped(blob, this.folder);
      this.url = uploaded;
      this.onChange(uploaded);
      this.onTouched();
      this.cropMode = false;
      this.cropSrc = '';
    } catch (e: any) {
      this.cropError = e.message ?? '上傳失敗';
    } finally {
      this.croppingUploading = false;
    }
  }

  private clamp() {
    const halfW = (this.naturalW * this.scale) / 2;
    const halfH = (this.naturalH * this.scale) / 2;
    const maxX = Math.max(0, halfW - CIRCLE_R);
    const maxY = Math.max(0, halfH - CIRCLE_R);
    this.offsetX = Math.max(-maxX, Math.min(maxX, this.offsetX));
    this.offsetY = Math.max(-maxY, Math.min(maxY, this.offsetY));
  }

  private touchDist(e: TouchEvent): number {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private renderCrop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT;
        canvas.height = OUTPUT;
        const ctx = canvas.getContext('2d')!;
        ctx.beginPath();
        ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
        ctx.clip();
        const ratio = (OUTPUT / 2) / CIRCLE_R;
        const dw = this.naturalW * this.scale * ratio;
        const dh = this.naturalH * this.scale * ratio;
        const dx = OUTPUT / 2 + this.offsetX * ratio - dw / 2;
        const dy = OUTPUT / 2 + this.offsetY * ratio - dh / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('裁切失敗')), 'image/jpeg', 0.92);
      };
      img.onerror = () => reject(new Error('圖片載入失敗'));
      img.src = this.cropSrc;
    });
  }
}
