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
  template: `
    @if (nodes.length === 0) {
      <p class="text-sm text-gray-400 text-center py-6">尚無經歷記錄</p>
    } @else {
      <div class="overflow-x-auto pb-2">
        <div class="flex items-center gap-0 min-w-max px-2">
          @for (node of nodes; track node.historyId; let i = $index) {
            <!-- Node -->
            <button
              (click)="navigate(node.routePath)"
              class="border-2 text-left transition-all hover:shadow-md hover:-translate-y-0.5 min-w-[110px] max-w-[140px] focus:outline-none"
              [class.border-pink-400]="!node.isCurrent"
              [class.border-pink-500]="node.isCurrent"
              [class.shadow-md]="node.isCurrent"
              [style.outline]="node.isCurrent ? '3px solid #fce7f3' : 'none'"
              [style.outlineOffset]="'2px'"
            >
              <!-- Group name header -->
              <div
                class="px-2 py-1 text-center border-b"
                [class.bg-pink-100]="!node.isCurrent"
                [class.border-pink-200]="!node.isCurrent"
                [class.bg-pink-500]="node.isCurrent"
                [class.border-pink-500]="node.isCurrent"
              >
                <span
                  class="text-[10px] font-bold leading-tight block truncate"
                  [class.text-pink-800]="!node.isCurrent"
                  [class.text-white]="node.isCurrent"
                >{{ node.groupName }}</span>
              </div>
              <!-- Member info -->
              <div class="px-2 py-2 bg-white text-center">
                <p class="text-[13px] font-semibold text-gray-800 leading-snug truncate">{{ node.memberName }}</p>
                <p class="text-[9px] text-gray-400 mt-1 whitespace-nowrap">
                  {{ node.joinedAt }}
                  @if (node.isCurrent) { <span class="text-pink-400">〜</span> }
                  @else { 〜 {{ node.leftAt }} }
                </p>
              </div>
            </button>

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
  readonly instanceId = Math.random().toString(36).slice(2, 7);
  nodes: CareerNode[] = [];

  constructor(private router: Router) {}

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['histories']) return;
    const { nodes } = buildCareerGraph(this.histories);
    this.nodes = nodes;
  }

  navigate(path: string) {
    this.router.navigateByUrl(path);
  }
}
