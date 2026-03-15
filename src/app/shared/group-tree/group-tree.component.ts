import { Component, Input, OnChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { History, Team, Group } from '../../models';

interface TreeNode {
  type: 'team' | 'member';
  id: string;
  label: string;
  sublabel?: string;
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
  imports: [CommonModule],
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
                  style="font-family:'Cormorant Garamond',serif;letter-spacing:0.15em;">現役</h3>
              <div class="flex-1 h-px bg-gray-100"></div>
              <span class="text-xs text-gray-400">{{ flatGroup.activeNodes.length }}</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                  style="font-family:'Cormorant Garamond',serif;letter-spacing:0.15em;">退役</h3>
              <div class="flex-1 h-px bg-gray-100"></div>
              <span class="text-xs text-gray-400">{{ flatGroup.formerNodes.length }}</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
      <div class="cursor-pointer" (click)="selectMember.emit(node.history!)"
           [style.opacity]="dim ? '0.6' : '1'">
        <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-white
                    p-3 text-center hover:shadow-md hover:-translate-y-1 transition-all duration-200">
          @if (node.photo_url) {
            <img [src]="node.photo_url" [alt]="node.label"
                 class="w-14 h-14 rounded-full object-cover mx-auto mb-2 ring-2 ring-white shadow-sm">
          } @else {
            <div class="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-bold ring-2 ring-white shadow-sm"
                 [style.background]="(node.color || '#e879a0') + '22'"
                 [style.color]="node.color || '#e879a0'">
              {{ node.label[0] }}
            </div>
          }
          <p class="text-xs font-medium text-gray-800 leading-tight line-clamp-2">{{ node.label }}</p>
          @if (node.sublabel) {
            <p class="text-xs text-gray-400 mt-0.5 leading-tight">{{ node.sublabel }}</p>
          }
        </div>
      </div>
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
                  style="font-family:'Cormorant Garamond',serif;letter-spacing:0.15em;">
                {{ node.label }}
              </h3>
              <div class="flex-1 h-px bg-gray-100"></div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              @for (child of node.children || []; track child.id) {
                <div class="cursor-pointer" (click)="selectMember.emit(child.history!)"
                     [style.opacity]="child.history?.left_at ? '0.65' : '1'">
                  <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-white
                              p-3 text-center hover:shadow-md hover:-translate-y-1 transition-all duration-200">
                    @if (child.photo_url) {
                      <img [src]="child.photo_url" [alt]="child.label"
                           class="w-14 h-14 rounded-full object-cover mx-auto mb-2 ring-2 ring-white shadow-sm">
                    } @else {
                      <div class="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-bold ring-2 ring-white shadow-sm"
                           [style.background]="(child.color || '#e879a0') + '22'"
                           [style.color]="child.color || '#e879a0'">
                        {{ child.label[0] }}
                      </div>
                    }
                    <p class="text-xs font-medium text-gray-800 leading-tight line-clamp-2">{{ child.label }}</p>
                    @if (child.sublabel) {
                      <p class="text-xs text-gray-400 mt-0.5 leading-tight">{{ child.sublabel }}</p>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }

    @if (teamNodes.length === 0 && flatGroup.activeNodes.length === 0 && flatGroup.formerNodes.length === 0) {
      <div class="py-12 text-center">
        <p class="text-4xl text-gray-200 mb-3" style="font-family:'Cormorant Garamond',serif;">空</p>
        <p class="text-sm text-gray-400">此組合尚無成員資料</p>
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

  private buildTree() {
    if (this.teams.length === 0) {
      const active = this.histories
        .filter(h => !h.left_at)
        .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());

      const former = this.histories
        .filter(h => !!h.left_at)
        .sort((a, b) => new Date(b.left_at!).getTime() - new Date(a.left_at!).getTime());

      this.flatGroup = {
        activeNodes: active.map(h => this.historyToNode(h)),
        formerNodes: former.map(h => this.historyToNode(h)),
      };
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

    const noTeam: TreeNode[] = [];
    for (const h of this.histories) {
      const node = this.historyToNode(h);
      if (h.team_id && teamMap.has(h.team_id)) {
        teamMap.get(h.team_id)!.children!.push(node);
      } else {
        noTeam.push(node);
      }
    }

    this.teamNodes = [
      ...Array.from(teamMap.values()).filter(t => t.children!.length > 0),
      ...noTeam
    ];
  }

  private historyToNode(h: History): TreeNode {
    const currentName = h.member?.name_roman || h.member?.name || '—';
    const label = h.name_at_time || currentName;
    const joined = h.joined_at.slice(0, 10).replaceAll('-', '.');
    const left = h.left_at ? h.left_at.slice(0, 10).replaceAll('-', '.') : '現在';
    // Show current name as sublabel if it differs from name_at_time
    const nameSublabel = (h.name_at_time && h.name_at_time !== currentName)
      ? currentName : undefined;
    return {
      type: 'member',
      id: h.id,
      label,
      sublabel: nameSublabel ?? `${joined}～${left}`,
      photo_url: h.member?.photo_url,
      history: h,
      color: this.group?.color
    };
  }
}
