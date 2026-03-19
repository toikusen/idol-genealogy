import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { History } from '../../models';

interface ChainCell {
  groupId: string;
  groupName: string;
  memberName: string;
  joinedAt: string;
  leftAt: string | null;
  status: string | null;
}

interface MemberRow {
  memberId: string;
  prevChain: ChainCell[];   // oldest → immediately before current group
  current: {
    memberName: string;
    joinedAt: string;
    leftAt: string | null;
    status: string | null;
  };
  nextChain: ChainCell[];   // immediately after current group → latest
}

@Component({
  selector: 'app-group-connection-graph',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (rows.length === 0) {
      <p class="text-sm text-gray-400 text-center py-6">尚無成員流動記錄</p>
    } @else {

      <!-- Shared arrow marker (hidden) -->
      <svg style="position:absolute;width:0;height:0;overflow:hidden;">
        <defs>
          <marker [attr.id]="'gcg-' + instanceId" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#d1d5db"/>
          </marker>
        </defs>
      </svg>

      <div style="overflow-x:auto; padding-bottom:16px;">
        <div style="display:inline-flex; flex-direction:column; gap:0; padding:8px 16px;">

          @for (row of rows; track row.memberId + row.current.joinedAt; let ri = $index) {
            <div style="display:flex; align-items:stretch; gap:0;">

              <!-- Left padding (empty slots for alignment) -->
              @for (n of range(maxLeft - row.prevChain.length); track n) {
                <div [style.width.px]="CELL_W + ARROW_W" style="flex-shrink:0;"></div>
              }

              <!-- Prev chain: [cell → arrow → cell → arrow → ...] -->
              @for (cell of row.prevChain; track cell.groupId + $index; let ci = $index) {
                <!-- Prev node -->
                <a [routerLink]="['/group', cell.groupId]"
                  [style.min-width.px]="CELL_W"
                  [style.max-width.px]="CELL_W"
                  [style.background]="cell.leftAt ? '#f3f4f6' : '#fff'"
                  [style.opacity]="cell.leftAt ? '0.75' : '1'"
                  style="flex-shrink:0; border:1.5px solid #e5e7eb; text-decoration:none; display:flex; flex-direction:column; align-self:center; transition: border-color 0.15s;"
                  onmouseover="this.style.borderColor='#f9a8d4'" onmouseout="this.style.borderColor='#e5e7eb'">
                  <div style="background:#1f2937; padding:4px 8px;">
                    <span style="font-size:10px; color:#fff; font-weight:600; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ cell.groupName }}</span>
                  </div>
                  <div style="padding:5px 8px;">
                    <p [style.color]="cell.leftAt ? '#9ca3af' : '#374151'" style="font-size:11px; font-weight:600; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ cell.memberName }}</p>
                    <p style="font-size:9px; color:#9ca3af; margin:2px 0 0; white-space:nowrap;">({{ cell.joinedAt }} – {{ cell.leftAt ?? '' }})</p>
                    <p style="font-size:9px; color:#d1d5db; margin:1px 0 0;">:</p>
                  </div>
                </a>
                <!-- Arrow → -->
                <div [style.width.px]="ARROW_W" style="flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                  <svg [attr.width]="ARROW_W" height="20" style="display:block;">
                    <line x1="2" y1="10" [attr.x2]="ARROW_W - 6" y2="10"
                      stroke="#d1d5db" stroke-width="1.5"
                      [attr.marker-end]="'url(#gcg-' + instanceId + ')'"/>
                  </svg>
                </div>
              }

              <!-- Center cell (current group) -->
              <div
                [style.min-width.px]="CENTER_W"
                [style.max-width.px]="CENTER_W"
                [ngStyle]="centerCellStyle(ri)"
                [style.background]="row.current.leftAt ? '#f3f4f6' : '#fff'"
                style="flex-shrink:0;">
                @if (ri === 0) {
                  <div style="background:#ec4899; padding:4px 10px; text-align:center;">
                    <span style="font-size:11px; color:#fff; font-weight:800; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ groupName }}</span>
                  </div>
                }
                <div style="padding:5px 10px;" [style.border-top]="ri > 0 ? '1px solid #fce7f3' : 'none'">
                  <p [style.color]="row.current.leftAt ? '#9ca3af' : '#374151'" style="font-size:11px; font-weight:600; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ row.current.memberName }}</p>
                  <p style="font-size:9px; color:#9ca3af; margin:2px 0 0; white-space:nowrap;">({{ row.current.joinedAt }}{{ row.current.leftAt ? ' – ' + row.current.leftAt : ' –' }})</p>
                </div>
              </div>

              <!-- Next chain: [arrow → cell → arrow → cell ...] -->
              @for (cell of row.nextChain; track cell.groupId + $index) {
                <!-- Arrow → -->
                <div [style.width.px]="ARROW_W" style="flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                  <svg [attr.width]="ARROW_W" height="20" style="display:block;">
                    <line x1="2" y1="10" [attr.x2]="ARROW_W - 6" y2="10"
                      stroke="#d1d5db" stroke-width="1.5"
                      [attr.marker-end]="'url(#gcg-' + instanceId + ')'"/>
                  </svg>
                </div>
                <!-- Next node -->
                <a [routerLink]="['/group', cell.groupId]"
                  [style.min-width.px]="CELL_W"
                  [style.max-width.px]="CELL_W"
                  [style.background]="cell.leftAt ? '#f3f4f6' : '#fff'"
                  [style.opacity]="cell.leftAt ? '0.75' : '1'"
                  style="flex-shrink:0; border:1.5px solid #e5e7eb; text-decoration:none; display:flex; flex-direction:column; align-self:center; transition: border-color 0.15s;"
                  onmouseover="this.style.borderColor='#f9a8d4'" onmouseout="this.style.borderColor='#e5e7eb'">
                  <div style="background:#1f2937; padding:4px 8px;">
                    <span style="font-size:10px; color:#fff; font-weight:600; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ cell.groupName }}</span>
                  </div>
                  <div style="padding:5px 8px;">
                    <p [style.color]="cell.leftAt ? '#9ca3af' : '#374151'" style="font-size:11px; font-weight:600; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ cell.memberName }}</p>
                    <p style="font-size:9px; color:#9ca3af; margin:2px 0 0; white-space:nowrap;">({{ cell.joinedAt }} – {{ cell.leftAt ?? '' }})</p>
                    <p style="font-size:9px; color:#d1d5db; margin:1px 0 0;">:</p>
                  </div>
                </a>
              }

              <!-- Right padding -->
              @for (n of range(maxRight - row.nextChain.length); track n) {
                <div [style.width.px]="ARROW_W + CELL_W" style="flex-shrink:0;"></div>
              }

            </div>
          }

        </div>
      </div>
    }
  `,
})
export class GroupConnectionGraphComponent implements OnChanges {
  @Input() groupHistories: History[] = [];
  @Input() allMemberHistories: History[] = [];
  @Input() groupId = '';
  @Input() groupName = '';

  rows: MemberRow[] = [];
  maxLeft = 0;
  maxRight = 0;

  readonly instanceId = Math.random().toString(36).slice(2, 7);
  readonly CELL_W = 130;
  readonly CENTER_W = 140;
  readonly ARROW_W = 36;

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['groupHistories'] && !changes['allMemberHistories'] && !changes['groupId']) return;
    this.build();
  }

  range(n: number): number[] {
    return n > 0 ? Array.from({ length: n }, (_, i) => i) : [];
  }

  centerCellStyle(ri: number): Record<string, string> {
    const isFirst = ri === 0;
    const isLast = ri === this.rows.length - 1;
    return {
      'border-left': '2.5px solid #ec4899',
      'border-right': '2.5px solid #ec4899',
      'border-top': isFirst ? '2.5px solid #ec4899' : 'none',
      'border-bottom': isLast ? '2.5px solid #ec4899' : 'none',
    };
  }

  private build() {
    if (!this.groupId) return;

    // One row per history entry in this group, sorted by joined_at (earliest first)
    const groupEntries = [...this.groupHistories]
      .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());

    this.rows = groupEntries.map(entry => {
      // Full history for this member across all groups, sorted chronologically
      const memberHistory = this.allMemberHistories
        .filter(h => h.member_id === entry.member_id)
        .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());

      // Find the index of this specific entry (by id, fallback to group_id match)
      let idx = memberHistory.findIndex(h => h.id === entry.id);
      if (idx < 0) idx = memberHistory.findIndex(h => h.group_id === this.groupId);

      const prevChain: ChainCell[] = idx > 0
        ? memberHistory.slice(0, idx).map(h => this.toCell(h))
        : [];

      const nextChain: ChainCell[] = idx >= 0 && idx < memberHistory.length - 1
        ? memberHistory.slice(idx + 1).map(h => this.toCell(h))
        : [];

      const memberName = entry.name_at_time
        || (entry as any).member?.name
        || (entry as any).member?.name_roman
        || '—';

      return {
        memberId: entry.member_id,
        current: {
          memberName,
          joinedAt: this.fmt(entry.joined_at),
          leftAt: entry.left_at ? this.fmt(entry.left_at) : null,
          status: entry.status ?? null,
        },
        prevChain,
        nextChain,
      };
    });

    this.maxLeft = this.rows.reduce((m, r) => Math.max(m, r.prevChain.length), 0);
    this.maxRight = this.rows.reduce((m, r) => Math.max(m, r.nextChain.length), 0);
  }

  private toCell(h: History): ChainCell {
    const memberName = h.name_at_time
      || (h as any).member?.name
      || (h as any).member?.name_roman
      || '—';
    return {
      groupId: h.group_id ?? '',
      groupName: (h as any).group?.name ?? h.external_group_name ?? '—',
      memberName,
      joinedAt: this.fmt(h.joined_at),
      leftAt: h.left_at ? this.fmt(h.left_at) : null,
      status: h.status ?? null,
    };
  }

  private fmt(d: string): string {
    return d.slice(0, 7).replaceAll('-', '.');
  }
}
