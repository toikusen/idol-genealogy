import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { StorageService } from '../../core/storage.service';

@Component({
  selector: 'app-photo-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => PhotoUploadComponent),
    multi: true,
  }],
  template: `
    <div class="space-y-2">

      <!-- Preview -->
      @if (url) {
        <div class="flex items-center gap-3">
          <img [src]="url" alt="預覽"
            class="w-14 h-14 rounded-lg object-cover border border-gray-200 flex-shrink-0 bg-gray-50"/>
          <span class="text-xs text-gray-400 truncate flex-1 min-w-0">{{ url }}</span>
          <button type="button" (click)="clear()"
            class="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors p-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      }

      <!-- Upload + URL row -->
      <div class="flex gap-2">
        <!-- Hidden file input -->
        <input #fileInput type="file" accept="image/jpeg,image/png"
          class="hidden" (change)="onFileSelect($event)"/>

        <!-- Upload button -->
        <button type="button" (click)="fileInput.click()" [disabled]="uploading"
          class="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-200 text-xs text-pink-500 hover:bg-pink-50 hover:border-pink-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          @if (uploading) {
            <svg class="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            上傳中…
          } @else {
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            上傳圖片
          }
        </button>

        <!-- URL input -->
        <input type="url" [ngModel]="url" (ngModelChange)="onUrlChange($event)"
          placeholder="或直接貼上 https://..."
          class="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"/>
      </div>

      <!-- Hint -->
      <p class="text-xs text-gray-400">最大 5MB，支援 JPG / PNG</p>

      <!-- Error -->
      @if (error) {
        <p class="text-xs text-red-500">{{ error }}</p>
      }
    </div>
  `,
})
export class PhotoUploadComponent implements ControlValueAccessor {
  @Input() folder: 'members' | 'groups' | 'companies' = 'members';

  url = '';
  uploading = false;
  error = '';

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private storage: StorageService) {}

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

  async onFileSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading = true;
    this.error = '';
    try {
      const uploaded = await this.storage.uploadPhoto(file, this.folder);
      this.url = uploaded;
      this.onChange(uploaded);
      this.onTouched();
    } catch (e: any) {
      this.error = e.message ?? '上傳失敗';
    } finally {
      this.uploading = false;
      (event.target as HTMLInputElement).value = '';
    }
  }
}
