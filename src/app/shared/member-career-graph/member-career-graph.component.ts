// src/app/shared/member-career-graph/member-career-graph.component.ts
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { History } from '../../models';
import { buildCareerGraph, CareerNode } from '../graph-utils';

@Component({
  selector: 'app-member-career-graph',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    @media (prefers-color-scheme: dark) {
      :host .bg-white {
        background: var(--bg-card) !important;
      }
      :host .bg-gray-100 {
        background: rgba(210, 175, 210, 0.12) !important;
      }
      :host .text-gray-800 {
        color: var(--text-primary) !important;
      }
      :host .text-gray-600 {
        color: var(--text-secondary) !important;
      }
      :host .text-gray-500 {
        color: var(--text-faint-55) !important;
      }
      :host .border-gray-200 {
        border-color: var(--border-subtle) !important;
      }
      :host .border-gray-300 {
        border-color: var(--border-default) !important;
      }
    }
  `],
  template: `
    @if (nodes.length === 0) {
      <p class="text-sm text-gray-400 text-center py-6">尚無經歷記錄</p>
    } @else {
      <div class="overflow-x-auto pb-2">
        <div class="flex items-center gap-0 min-w-max px-2">
          @for (node of nodes; track node.historyId; let i = $index) {
            <!-- Node: external/solo -->
            @if (node.isExternal) {
              @if (!node.externalCountry) {
                <!-- Solo: clickable → member page (unless already on that member's page) -->
                @if (currentMemberId !== node.memberId) {
                  <button
                    (click)="navigate('/member/' + node.memberId + '/')"
                    class="border-2 border-dashed text-left transition-all hover:shadow-md hover:-translate-y-0.5 min-w-[110px] max-w-[140px] focus:outline-none"
                    [class.border-pink-400]="node.isCurrent"
                    [class.border-gray-300]="!node.isCurrent"
                    [class.opacity-75]="!node.isCurrent"
                    [style.outline]="node.isCurrent ? '3px solid #fce7f3' : 'none'"
                    style="outline-offset:2px;">
                    <div class="px-2 py-1 text-center border-b"
                         [class.bg-pink-500]="node.isCurrent" [class.border-pink-200]="node.isCurrent"
                         [class.bg-gray-100]="!node.isCurrent" [class.border-gray-200]="!node.isCurrent">
                      <span class="text-[10px] font-bold leading-tight block truncate"
                            [class.text-white]="node.isCurrent" [class.text-gray-500]="!node.isCurrent">
                        {{ node.groupName }}
                      </span>
                    </div>
                    <div class="px-2 py-2 bg-white text-center">
                      <p class="text-[13px] font-semibold leading-snug truncate"
                         [class.text-gray-800]="node.isCurrent" [class.text-gray-600]="!node.isCurrent">{{ node.memberName }}</p>
                      <p class="text-[9px] text-gray-400 mt-1 whitespace-nowrap">
                        {{ node.joinedAt }}
                        @if (node.isCurrent) { <span class="text-pink-400">〜</span> }
                        @else { 〜 {{ node.leftAt }} }
                      </p>
                    </div>
                  </button>
                } @else {
                  <!-- Solo on member's own page: not clickable -->
                  <div class="border-2 border-dashed text-left min-w-[110px] max-w-[140px] cursor-default"
                       [class.border-pink-400]="node.isCurrent"
                       [class.border-gray-300]="!node.isCurrent"
                       [class.opacity-75]="!node.isCurrent">
                    <div class="px-2 py-1 text-center border-b"
                         [class.bg-pink-500]="node.isCurrent" [class.border-pink-200]="node.isCurrent"
                         [class.bg-gray-100]="!node.isCurrent" [class.border-gray-200]="!node.isCurrent">
                      <span class="text-[10px] font-bold leading-tight block truncate"
                            [class.text-white]="node.isCurrent" [class.text-gray-500]="!node.isCurrent">
                        {{ node.groupName }}
                      </span>
                    </div>
                    <div class="px-2 py-2 bg-white text-center">
                      <p class="text-[13px] font-semibold leading-snug truncate"
                         [class.text-gray-800]="node.isCurrent" [class.text-gray-600]="!node.isCurrent">{{ node.memberName }}</p>
                      <p class="text-[9px] text-gray-400 mt-1 whitespace-nowrap">
                        {{ node.joinedAt }}
                        @if (node.isCurrent) { <span class="text-pink-400">〜</span> }
                        @else { 〜 {{ node.leftAt }} }
                      </p>
                    </div>
                  </div>
                }
              } @else {
                <!-- 海外: NOT clickable -->
                <div class="border-2 border-dashed text-left min-w-[110px] max-w-[140px] cursor-default"
                     [class.border-pink-400]="node.isCurrent"
                     [class.border-gray-300]="!node.isCurrent"
                     [class.opacity-75]="!node.isCurrent">
                  <div class="px-2 py-1 text-center border-b"
                       [class.bg-pink-500]="node.isCurrent" [class.border-pink-200]="node.isCurrent"
                       [class.bg-gray-100]="!node.isCurrent" [class.border-gray-200]="!node.isCurrent">
                    <span class="text-[10px] font-bold leading-tight block truncate"
                          [class.text-white]="node.isCurrent" [class.text-gray-500]="!node.isCurrent">
                      {{ node.groupName }}
                    </span>
                  </div>
                  <div class="px-2 py-2 bg-white text-center">
                    @if (node.externalCountry) {
                      <p class="text-[9px] text-gray-400 leading-tight truncate mb-0.5">{{ node.externalCountry }}</p>
                    }
                    <p class="text-[13px] font-semibold leading-snug truncate"
                       [class.text-gray-800]="node.isCurrent" [class.text-gray-600]="!node.isCurrent">{{ node.memberName }}</p>
                    <p class="text-[9px] text-gray-400 mt-1 whitespace-nowrap">
                      {{ node.joinedAt }}
                      @if (node.isCurrent) { <span class="text-pink-400">〜</span> }
                      @else { 〜 {{ node.leftAt }} }
                    </p>
                  </div>
                </div>
              }
            }

            <!-- Node: internal (local group) -->
            @if (!node.isExternal) {
              @if (node.isCurrent) {
                <!-- Active internal: pink -->
                <button
                  (click)="navigate(node.routePath)"
                  class="border-2 border-pink-500 shadow-md text-left transition-all hover:shadow-lg hover:-translate-y-0.5 min-w-[110px] max-w-[140px] focus:outline-none"
                  [style.outline]="'3px solid #fce7f3'" style="outline-offset:2px;">
                  <div class="px-2 py-1 text-center border-b border-pink-500 bg-pink-500">
                    <span class="text-[10px] font-bold leading-tight block truncate text-white">{{ node.groupName }}</span>
                  </div>
                  <div class="px-2 py-2 bg-white text-center">
                    <p class="text-[13px] font-semibold text-gray-800 leading-snug truncate">{{ node.memberName }}</p>
                    <p class="text-[9px] text-gray-400 mt-1 whitespace-nowrap">
                      {{ node.joinedAt }}<span class="text-pink-400">〜</span>
                    </p>
                  </div>
                </button>
              } @else {
                <!-- Past internal: gray -->
                <button
                  (click)="navigate(node.routePath)"
                  class="border-2 border-gray-300 text-left transition-all hover:shadow-md hover:-translate-y-0.5 min-w-[110px] max-w-[140px] focus:outline-none opacity-75">
                  <div class="px-2 py-1 text-center border-b border-gray-200 bg-gray-400">
                    <span class="text-[10px] font-bold leading-tight block truncate text-white">{{ node.groupName }}</span>
                  </div>
                  <div class="px-2 py-2 bg-white text-center">
                    <p class="text-[13px] font-semibold text-gray-600 leading-snug truncate">{{ node.memberName }}</p>
                    <p class="text-[9px] text-gray-400 mt-1 whitespace-nowrap">
                      {{ node.joinedAt }} 〜 {{ node.leftAt }}
                    </p>
                  </div>
                </button>
              }
            }

            <!-- Arrow between nodes -->
            @if (i < nodes.length - 1) {
              <div class="flex-shrink-0 flex items-center px-1">
                <svg width="32" height="20">
                  <defs>
                    <marker [attr.id]="'arr-' + instanceId + '-' + i" markerWidth="6" markerHeight="6"
                      refX="5" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L6,3 z" fill="#f472b6"/>
                    </marker>
                  </defs>
                  <line x1="0" y1="10" x2="26" y2="10"
                    stroke="#f472b6" stroke-width="1.5"
                    [attr.marker-end]="'url(#arr-' + instanceId + '-' + i + ')'"/>
                </svg>
              </div>
            }
          }
        </div>
      </div>
    }
  `,
})
export class MemberCareerGraphComponent implements OnChanges {
  @Input() histories: History[] = [];
  /** Fallback name used when name_at_time is null and the DB join has no data */
  @Input() fallbackName = '';
  /** When set, solo nodes belonging to this member will not be clickable */
  @Input() currentMemberId: string | null = null;
  readonly instanceId = Math.random().toString(36).slice(2, 7);
  nodes: CareerNode[] = [];

  constructor(private router: Router) {}

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['histories'] && !changes['fallbackName']) return;
    const { nodes } = buildCareerGraph(this.histories, this.fallbackName);
    this.nodes = nodes;
  }

  navigate(path: string) {
    this.router.navigateByUrl(path);
  }
}
