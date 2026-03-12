import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { History } from '../../models';

interface TimelineSegment {
  history: History;
  concurrent: boolean;
  lane: number; // 0 = main, 1 = branch (offset right)
}

@Component({
  selector: 'app-member-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative">
      @for (seg of segments; track seg.history.id) {
        <div class="flex gap-4 mb-5" [class.pl-16]="seg.lane === 1">
          <!-- Timeline connector -->
          <div class="flex flex-col items-center flex-shrink-0">
            <div class="w-3 h-3 rounded-full border-2 border-white shadow-sm mt-1"
                 [style.background]="seg.history.group?.color || '#e879a0'"></div>
            <div class="flex-1 mt-1 border-l-2 min-h-[2rem]"
                 [style.borderLeftColor]="seg.history.group?.color || '#e4d4e4'"
                 [class.border-solid]="!seg.concurrent"
                 [class.border-dashed]="seg.concurrent"></div>
          </div>
          <!-- Card -->
          <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm px-4 py-3 flex-1 border border-white hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 mb-1">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full"
                        [style.background]="(seg.history.group?.color || '#e879a0') + '18'"
                        [style.color]="seg.history.group?.color || '#e879a0'">
                    {{ seg.history.group?.name || '—' }}
                    @if (seg.history.team) {
                      <span class="opacity-60">/ {{ seg.history.team.name }}</span>
                    }
                  </span>
                  @if (seg.concurrent) {
                    <span class="text-xs text-idol-purple font-medium">兼任</span>
                  }
                  @if (seg.history.status === 'graduated') {
                    <span class="text-xs text-gray-400">卒業</span>
                  }
                  @if (seg.history.status === 'transferred') {
                    <span class="text-xs text-blue-400">移籍</span>
                  }
                </div>
                @if (seg.history.name_at_time) {
                  <p class="text-xs mt-1" style="color: rgba(122,90,122,0.65);">
                    <span style="
                      display: inline-block;
                      padding: 1px 7px;
                      border-radius: 10px;
                      border: 1px solid rgba(232,121,160,0.25);
                      background: rgba(232,121,160,0.06);
                      font-size: 0.7rem;
                      letter-spacing: 0.04em;
                    ">當時名義：{{ seg.history.name_at_time }}</span>
                  </p>
                }
                @if (seg.history.role) {
                  <p class="text-xs text-gray-500 leading-relaxed">{{ seg.history.role }}</p>
                }
                @if (seg.history.notes) {
                  <p class="text-xs text-gray-400 mt-1 italic leading-relaxed">{{ seg.history.notes }}</p>
                }
              </div>
              <div class="text-right flex-shrink-0">
                <p class="text-xs text-gray-400 whitespace-nowrap font-light">
                  {{ seg.history.joined_at.slice(0,7).replace('-','.') }}
                  @if (!seg.history.left_at) { <span class="text-idol-pink">〜</span> }
                  @else { 〜 {{ seg.history.left_at.slice(0,7).replace('-','.') }} }
                </p>
              </div>
            </div>
          </div>
        </div>
      }
      @if (segments.length === 0) {
        <div class="py-12 text-center">
          <p class="text-4xl text-gray-200 mb-3" style="font-family:'Cormorant Garamond',serif;">空</p>
          <p class="text-sm text-gray-400">此成員尚無歷史記錄</p>
          <p class="text-xs text-gray-300 mt-1">歡迎登入後補充資料</p>
        </div>
      }
    </div>
  `
})
export class MemberTimelineComponent implements OnChanges {
  @Input() histories: History[] = [];
  segments: TimelineSegment[] = [];

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
