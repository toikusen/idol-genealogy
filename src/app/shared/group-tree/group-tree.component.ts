import { Component, Input, OnChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { History, Team, Group } from '../../models';
import { SupabaseImgPipe } from '../supabase-img.pipe';

interface TreeNode {
  type: 'team' | 'member';
  id: string;
  label: string;
  periods?: string[];
  photo_url?: string | null;
  history?: History;
  children?: TreeNode[];
  color?: string;
}

interface FlatGroup {
  activeNodes: TreeNode[];
  formerNodes: TreeNode[];
}

@Component({
  selector: 'app-group-tree',
  standalone: true,
  imports: [CommonModule, SupabaseImgPipe],
  styles: [`
    .gt-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
    }
    .gt-ring { --tw-ring-color: rgba(255, 255, 255, 0.90); }
    .gt-divider { background: var(--border-subtle); }
    :host-context([data-theme="dark"]) .gt-card {
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.28);
    }
    :host-context([data-theme="dark"]) .gt-card:hover {
      background: var(--bg-card-hover);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.30);
    }
    :host-context([data-theme="dark"]) .gt-ring {
      --tw-ring-color: rgba(255, 255, 255, 0.14);
    }
    :host-context([data-theme="dark"]) .text-gray-800 { color: var(--text-primary) !important; }
    :host-context([data-theme="dark"]) .text-gray-500 { color: var(--text-secondary) !important; }
    :host-context([data-theme="dark"]) .text-gray-400 { color: var(--text-faint-55) !important; }
  `],
  template: `
    <!-- No-team: split into active / former -->
    @if (teamNodes.length === 0 && (flatGroup.activeNodes.length > 0 || flatGroup.formerNodes.length > 0)) {
      <div class="space-y-8">

        <!-- Active members -->
        @if (flatGroup.activeNodes.length > 0) {
          <div>
            <div class="flex items-center gap-3 mb-4">
              <span class="w-2 h-2 rounded-full flex-shrink-0"
                    [style.background]="group?.color || '#e879a0'"></span>
              <h3 class="text-sm font-medium text-gray-500 uppercase tracking-widest"
                  style="font-family:'JF Openhuninn',sans-serif;letter-spacing:0.15em;">現役</h3>
              <div class="flex-1 h-px gt-divider"></div>
              <span class="text-xs text-gray-400">{{ flatGroup.activeNodes.length }}</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              @for (node of flatGroup.activeNodes; track node.id) {
                <ng-container *ngTemplateOutlet="memberCard; context: { node: node, dim: false }"></ng-container>
              }
            </div>
          </div>
        }

        <!-- Former members -->
        @if (flatGroup.formerNodes.length > 0) {
          <div>
            <div class="flex items-center gap-3 mb-4">
              <span class="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300"></span>
              <h3 class="text-sm font-medium text-gray-400 uppercase tracking-widest"
                  style="font-family:'JF Openhuninn',sans-serif;letter-spacing:0.15em;">退役</h3>
              <div class="flex-1 h-px gt-divider"></div>
              <span class="text-xs text-gray-400">{{ flatGroup.formerNodes.length }}</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              @for (node of flatGroup.formerNodes; track node.id) {
                <ng-container *ngTemplateOutlet="memberCard; context: { node: node, dim: true }"></ng-container>
              }
            </div>
          </div>
        }

      </div>
    }

    <!-- Shared member card template -->
    <ng-template #memberCard let-node="node" let-dim="dim">
      <button type="button"
           class="block w-full h-full p-0 text-left bg-transparent border-0 rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
           (click)="selectMember.emit(node.history!)"
           [style.opacity]="dim ? '0.6' : '1'">
        <div class="gt-card backdrop-blur-sm rounded-2xl shadow-sm h-full
                    p-4 flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-all duration-200">
          @if (node.photo_url) {
            <img [src]="node.photo_url | supabaseImg:128" [alt]="node.label"
                 class="w-16 h-16 rounded-full object-cover mx-auto mb-2.5 ring-2 gt-ring shadow-sm">
          } @else {
            <div class="w-16 h-16 rounded-full mx-auto mb-2.5 flex items-center justify-center text-xl font-bold ring-2 gt-ring shadow-sm"
                 [style.background]="(node.color || '#e879a0') + '22'"
                 [style.color]="node.color || '#e879a0'">
              {{ node.label[0] }}
            </div>
          }
          <p class="text-sm font-medium leading-tight line-clamp-2"
             [class.text-gray-800]="!dim" [class.text-gray-400]="dim">{{ node.label }}</p>
          <div class="flex flex-wrap justify-center gap-x-1.5 gap-y-0 mt-1">
            @for (period of (node.periods ?? []); track period) {
              <span class="text-xs text-gray-400 whitespace-nowrap leading-tight">{{ period }}</span>
            }
          </div>
        </div>
      </button>
    </ng-template>

    <!-- Has teams: each team section with its own grid -->
    @if (teamNodes.length > 0 && teamNodes[0].type === 'team') {
      <div class="space-y-8">
        @for (node of teamNodes; track node.id) {
          <div>
            <div class="flex items-center gap-3 mb-4">
              <span class="w-2 h-2 rounded-full flex-shrink-0"
                    [style.background]="node.color || group?.color || '#e879a0'"></span>
              <h3 class="text-sm font-medium tracking-widest uppercase text-gray-500"
                  style="font-family:'JF Openhuninn',sans-serif;letter-spacing:0.15em;">
                {{ node.label }}
              </h3>
              <div class="flex-1 h-px gt-divider"></div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              @for (child of node.children || []; track child.id) {
                <button type="button"
                     class="block w-full h-full p-0 text-left bg-transparent border-0 rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
                     (click)="selectMember.emit(child.history!)"
                     [style.opacity]="child.history?.left_at ? '0.65' : '1'">
                  <div class="gt-card backdrop-blur-sm rounded-2xl shadow-sm h-full
                              p-4 flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-all duration-200">
                    @if (child.photo_url) {
                      <img [src]="child.photo_url | supabaseImg:128" [alt]="child.label"
                           class="w-16 h-16 rounded-full object-cover mx-auto mb-2.5 ring-2 gt-ring shadow-sm">
                    } @else {
                      <div class="w-16 h-16 rounded-full mx-auto mb-2.5 flex items-center justify-center text-xl font-bold ring-2 gt-ring shadow-sm"
                           [style.background]="(child.color || '#e879a0') + '22'"
                           [style.color]="child.color || '#e879a0'">
                        {{ child.label[0] }}
                      </div>
                    }
                    <p class="text-sm font-medium leading-tight line-clamp-2"
                       [class.text-gray-800]="!child.history?.left_at" [class.text-gray-400]="!!child.history?.left_at">{{ child.label }}</p>
                    @if (child.periods?.length) {
                      <div class="flex flex-wrap justify-center gap-x-1.5 gap-y-0 mt-1">
                        @for (period of child.periods; track period) {
                          <span class="text-xs text-gray-400 whitespace-nowrap leading-tight">{{ period }}</span>
                        }
                      </div>
                    }
                  </div>
                </button>
              }
            </div>
          </div>
        }
      </div>
    }

    @if (teamNodes.length === 0 && flatGroup.activeNodes.length === 0 && flatGroup.formerNodes.length === 0) {
      <div class="py-12 text-center">
        <p class="text-4xl text-gray-200 mb-3" style="font-family:'JF Openhuninn',sans-serif;">空</p>
        <p class="text-sm text-gray-400">此團體尚無成員資料</p>
        <p class="text-xs text-gray-300 mt-1">歡迎登入後補充資料</p>
      </div>
    }
  `
})
export class GroupTreeComponent implements OnChanges {
  @Input() group: Group | null = null;
  @Input() histories: History[] = [];
  @Input() teams: Team[] = [];
  @Output() selectMember = new EventEmitter<History>();

  teamNodes: TreeNode[] = [];
  flatGroup: FlatGroup = { activeNodes: [], formerNodes: [] };

  ngOnChanges() {
    this.buildTree();
  }

  /** left_at 有值且日期已過才算離開；未來日期仍視為現役 */
  private hasLeft(h: History): boolean {
    if (!h.left_at) return false;
    return new Date(h.left_at).getTime() <= Date.now();
  }

  private groupByMember(histories: History[]): Map<string, History[]> {
    const map = new Map<string, History[]>();
    for (const h of histories) {
      if (!map.has(h.member_id)) map.set(h.member_id, []);
      map.get(h.member_id)!.push(h);
    }
    return map;
  }

  private primaryHistory(histories: History[]): History {
    return histories.find(h => !this.hasLeft(h))
      ?? histories.reduce((latest, h) =>
          new Date(h.joined_at) > new Date(latest.joined_at) ? h : latest
        );
  }

  private buildTree() {
    if (this.teams.length === 0) {
      const grouped = this.groupByMember(this.histories);
      const activeNodes: TreeNode[] = [];
      const formerNodes: TreeNode[] = [];

      for (const memberHistories of grouped.values()) {
        const hasActive = memberHistories.some(h => !this.hasLeft(h));
        const primary = this.primaryHistory(memberHistories);
        const node = this.historyToNode(primary, memberHistories);
        if (hasActive) {
          activeNodes.push(node);
        } else {
          formerNodes.push(node);
        }
      }

      activeNodes.sort((a, b) =>
        new Date(a.history!.joined_at).getTime() - new Date(b.history!.joined_at).getTime()
      );
      formerNodes.sort((a, b) => {
        const aLeft = a.history!.left_at ?? '';
        const bLeft = b.history!.left_at ?? '';
        return bLeft.localeCompare(aLeft);
      });

      this.flatGroup = { activeNodes, formerNodes };
      this.teamNodes = [];
      return;
    }

    const teamMap = new Map<string, TreeNode>();
    for (const team of this.teams) {
      teamMap.set(team.id, {
        type: 'team',
        id: team.id,
        label: team.name,
        color: team.color || this.group?.color,
        children: []
      });
    }

    // Group per-team histories by member_id, then deduplicate
    const teamHistoriesMap = new Map<string, History[]>();
    const noTeamHistories: History[] = [];
    for (const h of this.histories) {
      if (h.team_id && teamMap.has(h.team_id)) {
        if (!teamHistoriesMap.has(h.team_id)) teamHistoriesMap.set(h.team_id, []);
        teamHistoriesMap.get(h.team_id)!.push(h);
      } else {
        noTeamHistories.push(h);
      }
    }

    for (const [teamId, hs] of teamHistoriesMap) {
      const grouped = this.groupByMember(hs);
      const children: TreeNode[] = [];
      for (const memberHistories of grouped.values()) {
        const primary = this.primaryHistory(memberHistories);
        children.push(this.historyToNode(primary, memberHistories));
      }
      teamMap.get(teamId)!.children = children;
    }

    const noTeamGrouped = this.groupByMember(noTeamHistories);
    const noTeam: TreeNode[] = [];
    for (const memberHistories of noTeamGrouped.values()) {
      const primary = this.primaryHistory(memberHistories);
      noTeam.push(this.historyToNode(primary, memberHistories));
    }

    this.teamNodes = [
      ...Array.from(teamMap.values()).filter(t => t.children!.length > 0),
      ...noTeam
    ];
  }

  private historyToNode(h: History, allHistories?: History[]): TreeNode {
    const currentName = h.member?.name || h.member?.name_roman || '—';
    const label = h.name_at_time || currentName;

    const source = allHistories?.length ? allHistories : [h];
    const sorted = [...source].sort(
      (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    );
    const periods = sorted.map(hist => {
      const joined = hist.joined_at.slice(0, 10).replaceAll('-', '.');
      const left = hist.left_at ? hist.left_at.slice(0, 10).replaceAll('-', '.') : '現在';
      return `${joined}～${left}`;
    });

    return {
      type: 'member',
      id: h.member_id,
      label,
      periods,
      photo_url: h.member?.photo_url,
      history: h,
      color: this.group?.color
    };
  }
}
