import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { History } from '../../models';

interface TimelineSegment {
  history: History;
  concurrent: boolean;
  lane: number; // 0 = main, 1 = branch (offset right)
}

@Component({
  selector: 'app-member-timeline',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    .tl-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
    }
    .tl-dot { border-color: rgba(255, 255, 255, 0.90); }
    .tl-chip-muted {
      background: rgba(200, 192, 200, 0.15);
      color: #6b7280;
    }
    :host-context([data-theme="dark"]) .tl-card {
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.28);
    }
    :host-context([data-theme="dark"]) .tl-dot {
      border-color: rgba(255, 255, 255, 0.14);
    }
    :host-context([data-theme="dark"]) .tl-chip-muted {
      background: rgba(210, 175, 210, 0.10);
      color: var(--text-faint-55);
    }
    :host-context([data-theme="dark"]) .text-gray-500 { color: var(--text-faint-55) !important; }
    :host-context([data-theme="dark"]) .text-gray-400 { color: var(--text-faint-45) !important; }
    :host-context([data-theme="dark"]) .text-gray-300 { color: var(--text-faint-35) !important; }
    :host-context([data-theme="dark"]) .border-gray-200 { border-color: var(--border-subtle) !important; }
  `],
  template: `
    <div class="relative">
      @for (seg of segments; track seg.history.id) {
        <div class="flex gap-4 mb-5" [class.pl-16]="seg.lane === 1">
          <!-- Timeline connector -->
          <div class="flex flex-col items-center flex-shrink-0">
            <div class="w-3 h-3 rounded-full border-2 tl-dot shadow-sm mt-1"
                 [style.background]="seg.history.group?.color || '#e879a0'"></div>
            <div class="flex-1 mt-1 border-l-2 min-h-[2rem]"
                 [style.borderLeftColor]="seg.history.group?.color || '#e4d4e4'"
                 [class.border-solid]="!seg.concurrent"
                 [class.border-dashed]="seg.concurrent"></div>
          </div>
          <!-- Card -->
          <div class="tl-card backdrop-blur-sm rounded-2xl shadow-sm px-4 py-3 flex-1 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 mb-1">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  @if (seg.history.group_id) {
                    @if (!hasLeft(seg.history)) {
                      <a class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full"
                         [routerLink]="'/group/' + seg.history.group_id + '/'"
                         [style.background]="(seg.history.group?.color || '#e879a0') + '18'"
                         [style.color]="safeColor(seg.history.group?.color || '#e879a0')"
                         style="text-decoration:none;">
                        {{ seg.history.group?.name || '—' }}
                        @if (seg.history.team) {
                          <span class="opacity-60">/ {{ seg.history.team.name }}</span>
                        }
                      </a>
                    } @else {
                      <a class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full tl-chip-muted"
                         [routerLink]="'/group/' + seg.history.group_id + '/'"
                         style="text-decoration:none;">
                        {{ seg.history.group?.name || '—' }}
                        @if (seg.history.team) {
                          <span class="opacity-60">/ {{ seg.history.team.name }}</span>
                        }
                      </a>
                    }
                  } @else {
                    @if (!seg.history.left_at) {
                      <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full"
                            style="background:rgba(232,121,160,0.12);color:var(--text-link);">
                        {{ seg.history.external_group_name || '—' }}
                        @if (seg.history.external_country) {
                          <span class="opacity-60">· {{ seg.history.external_country }}</span>
                        }
                      </span>
                    } @else {
                      <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full tl-chip-muted">
                        {{ seg.history.external_group_name || '—' }}
                        @if (seg.history.external_country) {
                          <span class="opacity-60">· {{ seg.history.external_country }}</span>
                        }
                      </span>
                    }
                    @if (seg.history.external_country) {
                      <span class="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">海外</span>
                    } @else {
                      <span class="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">solo</span>
                    }
                  }
                  @if (seg.concurrent) {
                    <span class="text-xs text-idol-purple font-medium">兼任</span>
                  }
                  @if (seg.history.status === 'graduated') {
                    <span class="text-xs text-gray-400">畢業</span>
                  }
                  @if (seg.history.status === 'transferred') {
                    <span class="text-xs text-idol-purple font-medium">移籍</span>
                  }
                  @if (seg.history.status === 'support') {
                    <span class="text-xs text-idol-purple font-medium">支援</span>
                  }
                  @if (seg.history.status === 'hiatus') {
                    <span class="text-xs text-yellow-600 font-medium">活休</span>
                  }
                  @if (seg.history.status === 'withdrawn') {
                    <span class="text-xs text-gray-400">脫退</span>
                  }
                </div>
                @if (seg.history.name_at_time) {
                  <p class="text-xs mt-1" style="color: var(--text-faint-65);">
                    <span style="
                      display: inline-block;
                      padding: 1px 7px;
                      border-radius: 10px;
                      border: 1px solid rgba(232,121,160,0.25);
                      background: rgba(232,121,160,0.06);
                      font-size: 0.7rem;
                      letter-spacing: 0.04em;
                    ">當時名稱：{{ seg.history.name_at_time }}</span>
                  </p>
                }
                @if (seg.history.role) {
                  <p class="text-xs text-gray-500 leading-relaxed">{{ seg.history.role }}</p>
                }
                @if (seg.history.notes) {
                  <p class="text-xs text-gray-400 mt-1 italic leading-relaxed">{{ seg.history.notes }}</p>
                }
              </div>
              <div class="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
                <p class="text-xs text-gray-400 whitespace-nowrap font-light">
                  {{ seg.history.joined_at.slice(0,10).replaceAll('-','.') }}
                  @if (!seg.history.left_at) { <span class="text-idol-pink">〜</span> }
                  @else { 〜 {{ seg.history.left_at.slice(0,10).replaceAll('-','.') }} }
                </p>
                <button
                  type="button"
                  (click)="reportHistory.emit(seg.history)"
                  title="回報此記錄有問題"
                  class="text-gray-300 hover:text-red-400 transition-colors"
                  style="font-size:0.65rem;line-height:1;padding:2px 4px;border-radius:4px;border:1px solid currentColor;">
                  ⚑ 回報
                </button>
              </div>
            </div>
          </div>
        </div>
      }
      @if (segments.length === 0) {
        <div class="py-12 text-center">
          <p class="text-4xl text-gray-200 mb-3" style="font-family:'JF Openhuninn',sans-serif;">空</p>
          <p class="text-sm text-gray-400">此成員尚無歷史記錄</p>
          <p class="text-xs text-gray-300 mt-1">歡迎登入後補充資料</p>
        </div>
      }
    </div>
  `
})
export class MemberTimelineComponent implements OnChanges {
  @Input() histories: History[] = [];
  @Output() reportHistory = new EventEmitter<History>();
  segments: TimelineSegment[] = [];

  safeColor(hex: string, fallback = '#7a5a7a'): string {
    const clean = hex.replace('#', '');
    if (clean.length < 6) return fallback;
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 0.75 ? fallback : hex;
  }

  hasLeft(h: History): boolean {
    if (!h.left_at) return false;
    return new Date(h.left_at).getTime() <= Date.now();
  }

  ngOnChanges() {
    this.buildSegments();
  }

  private buildSegments() {
    const concurrentIds = new Set<string>();

    for (let i = 0; i < this.histories.length; i++) {
      for (let j = i + 1; j < this.histories.length; j++) {
        const a = this.histories[i];
        const b = this.histories[j];
        if (a.status === 'concurrent' || b.status === 'concurrent') {
          const aEnd = a.left_at ? new Date(a.left_at) : new Date();
          const bEnd = b.left_at ? new Date(b.left_at) : new Date();
          const aStart = new Date(a.joined_at);
          const bStart = new Date(b.joined_at);
          if (aStart <= bEnd && bStart <= aEnd) {
            concurrentIds.add(a.id);
            concurrentIds.add(b.id);
          }
        }
      }
    }

    let laneCounter = 0;
    this.segments = this.histories.map(h => {
      const concurrent = concurrentIds.has(h.id);
      const lane = concurrent ? (laneCounter++ % 2) : 0;
      return { history: h, concurrent, lane };
    });
  }
}
