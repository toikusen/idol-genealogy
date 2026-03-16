// src/app/shared/group-connection-graph/group-connection-graph.component.ts
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { History } from '../../models';

interface ConnectionEntry {
  groupId: string;
  groupName: string;
  memberName: string;
  date: string;
}

@Component({
  selector: 'app-group-connection-graph',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="flex items-center justify-center gap-0 overflow-x-auto py-4 px-2">

      <!-- Incoming groups (left) -->
      <div class="flex flex-col gap-3 items-end min-w-[130px]">
        @for (entry of incoming; track entry.groupId + entry.memberName) {
          <a [routerLink]="['/group', entry.groupId]"
             class="block border-2 border-pink-200 bg-white text-left hover:border-pink-400 hover:shadow-sm transition-all min-w-[120px] max-w-[150px]">
            <div class="bg-pink-50 border-b border-pink-100 px-2 py-1">
              <span class="text-[10px] font-bold text-pink-700 block truncate">{{ entry.groupName }}</span>
            </div>
            <div class="px-2 py-1.5">
              <p class="text-[11px] font-medium text-gray-700 truncate">{{ entry.memberName }}</p>
              <p class="text-[9px] text-gray-400">→ {{ entry.date }}</p>
            </div>
          </a>
        }
        @if (incoming.length === 0) {
          <p class="text-xs text-gray-300 pr-2">（無轉入記錄）</p>
        }
      </div>

      <!-- Incoming arrows SVG -->
      <svg [attr.width]="54" [attr.height]="Math.max(incoming.length, 1) * 60"
           class="flex-shrink-0 overflow-visible">
        <defs>
          <marker [attr.id]="'cin-' + instanceId" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#f9a8d4"/>
          </marker>
        </defs>
        @for (entry of incoming; track $index; let i = $index) {
          <line
            x1="0" [attr.y1]="(i + 0.5) * 60"
            x2="48" [attr.y2]="Math.max(incoming.length, 1) * 30"
            stroke="#f9a8d4" stroke-width="1.5" [attr.marker-end]="'url(#cin-' + instanceId + ')'"/>
        }
      </svg>

      <!-- Center: current group -->
      <div class="border-[3px] border-pink-500 bg-white text-center min-w-[120px] flex-shrink-0"
           style="box-shadow: 0 0 0 4px #fce7f3;">
        <div class="bg-pink-500 px-3 py-2">
          <span class="text-xs font-bold text-white block truncate">{{ groupName }}</span>
        </div>
        <div class="px-3 py-2">
          <p class="text-[11px] text-gray-500">{{ currentMemberCount }} 名成員</p>
        </div>
      </div>

      <!-- Outgoing arrows SVG -->
      <svg [attr.width]="54" [attr.height]="Math.max(outgoing.length, 1) * 60"
           class="flex-shrink-0 overflow-visible">
        <defs>
          <marker [attr.id]="'cout-' + instanceId" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#f9a8d4"/>
          </marker>
        </defs>
        @for (entry of outgoing; track $index; let i = $index) {
          <line
            x1="6" [attr.y1]="Math.max(outgoing.length, 1) * 30"
            x2="54" [attr.y2]="(i + 0.5) * 60"
            stroke="#f9a8d4" stroke-width="1.5" [attr.marker-end]="'url(#cout-' + instanceId + ')'"/>
        }
      </svg>

      <!-- Outgoing groups (right) -->
      <div class="flex flex-col gap-3 items-start min-w-[130px]">
        @for (entry of outgoing; track entry.groupId + entry.memberName) {
          <a [routerLink]="['/group', entry.groupId]"
             class="block border-2 border-pink-200 bg-white text-left hover:border-pink-400 hover:shadow-sm transition-all min-w-[120px] max-w-[150px]">
            <div class="bg-pink-50 border-b border-pink-100 px-2 py-1">
              <span class="text-[10px] font-bold text-pink-700 block truncate">{{ entry.groupName }}</span>
            </div>
            <div class="px-2 py-1.5">
              <p class="text-[11px] font-medium text-gray-700 truncate">{{ entry.memberName }}</p>
              <p class="text-[9px] text-gray-400">{{ entry.date }} →</p>
            </div>
          </a>
        }
        @if (outgoing.length === 0) {
          <p class="text-xs text-gray-300 pl-2">（無轉出記錄）</p>
        }
      </div>

    </div>
  `,
})
export class GroupConnectionGraphComponent implements OnChanges {
  /** Histories for the current group (from getByGroup) */
  @Input() groupHistories: History[] = [];
  /** All histories for members who were in this group (from getByMembers) */
  @Input() allMemberHistories: History[] = [];
  @Input() groupId = '';
  @Input() groupName = '';

  incoming: ConnectionEntry[] = [];
  outgoing: ConnectionEntry[] = [];
  currentMemberCount = 0;
  Math = Math;
  readonly instanceId = Math.random().toString(36).slice(2, 7);

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['groupHistories'] && !changes['allMemberHistories'] && !changes['groupId']) return;
    this.build();
  }

  private build() {
    if (!this.groupId) return;

    // Member IDs who were in this group
    const memberIds = new Set(this.groupHistories.map(h => h.member_id));
    this.currentMemberCount = new Set(
      this.groupHistories.filter(h => !h.left_at).map(h => h.member_id)
    ).size;

    const incomingMap = new Map<string, ConnectionEntry>();
    const outgoingMap = new Map<string, ConnectionEntry>();

    for (const memberId of memberIds) {
      // All history for this member, sorted by joined_at
      const memberHistory = this.allMemberHistories
        .filter(h => h.member_id === memberId)
        .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());

      for (let i = 0; i < memberHistory.length; i++) {
        const h = memberHistory[i];
        if (h.group_id !== this.groupId) continue;

        const memberName = h.member?.name ?? '—';

        // Previous group → this group (incoming)
        if (i > 0) {
          const prev = memberHistory[i - 1];
          if (prev.group_id !== this.groupId) {
            const key = `${prev.group_id}:${memberId}`;
            incomingMap.set(key, {
              groupId: prev.group_id,
              groupName: prev.group?.name ?? '—',
              memberName,
              date: h.joined_at.slice(0, 7).replaceAll('-', '.'),
            });
          }
        }

        // This group → next group (outgoing)
        if (i < memberHistory.length - 1) {
          const next = memberHistory[i + 1];
          if (next.group_id !== this.groupId) {
            const key = `${next.group_id}:${memberId}`;
            outgoingMap.set(key, {
              groupId: next.group_id,
              groupName: next.group?.name ?? '—',
              memberName,
              date: (h.left_at ?? '').slice(0, 7).replaceAll('-', '.'),
            });
          }
        }
      }
    }

    this.incoming = Array.from(incomingMap.values());
    this.outgoing = Array.from(outgoingMap.values());
  }
}
