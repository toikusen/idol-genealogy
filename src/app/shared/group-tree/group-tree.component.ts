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

@Component({
  selector: 'app-group-tree',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-8">
      @for (node of teamNodes; track node.id) {
        <div>
          @if (node.type === 'team') {
            <!-- Team header -->
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
                <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-white cursor-pointer
                            p-3 text-center hover:shadow-md hover:-translate-y-1 transition-all duration-200"
                     (click)="selectMember.emit(child.history!)">
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
              }
            </div>
          } @else {
            <!-- Member node directly (no team layer) -->
            <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-white cursor-pointer
                        p-3 text-center hover:shadow-md hover:-translate-y-1 transition-all duration-200 inline-block"
                 (click)="selectMember.emit(node.history!)">
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
          }
        </div>
      }

      @if (teamNodes.length === 0) {
        <div class="py-12 text-center">
          <p class="text-4xl text-gray-200 mb-3" style="font-family:'Cormorant Garamond',serif;">空</p>
          <p class="text-sm text-gray-400">此組合尚無成員資料</p>
          <p class="text-xs text-gray-300 mt-1">歡迎登入後補充資料</p>
        </div>
      }
    </div>
  `
})
export class GroupTreeComponent implements OnChanges {
  @Input() group: Group | null = null;
  @Input() histories: History[] = [];
  @Input() teams: Team[] = [];
  @Output() selectMember = new EventEmitter<History>();

  teamNodes: TreeNode[] = [];

  ngOnChanges() {
    this.buildTree();
  }

  private buildTree() {
    if (this.teams.length === 0) {
      // Flat: no team layer — render members directly
      this.teamNodes = this.histories.map(h => this.historyToNode(h));
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
    const name = h.member?.name_jp || h.member?.name || '—';
    const joined = h.joined_at.slice(0, 7).replace('-', '.');
    const left = h.left_at ? h.left_at.slice(0, 7).replace('-', '.') : '現在';
    return {
      type: 'member',
      id: h.id,
      label: name,
      sublabel: `${joined}～${left}`,
      photo_url: h.member?.photo_url,
      history: h,
      color: this.group?.color
    };
  }
}
