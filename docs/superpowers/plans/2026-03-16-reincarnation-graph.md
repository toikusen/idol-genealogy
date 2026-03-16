# Reincarnation Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three interactive graph components showing idol career history as branch diagrams: member career flow, group connection view, and global group map.

**Architecture:** A shared `graph-utils.ts` handles pure data transformation (History[] → GraphNode[]/GraphEdge[]). `MemberCareerGraphComponent` and `GroupConnectionGraphComponent` use Angular + inline SVG. `GlobalGroupMapComponent` uses D3 force simulation for position calculation with Angular rendering HTML nodes.

**Tech Stack:** Angular 19 (standalone components), D3.js v7, Tailwind CSS, TypeScript, Supabase (existing services)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/shared/graph-utils.ts` | Create | Types + pure transformation functions |
| `src/app/shared/member-career-graph/member-career-graph.component.ts` | Create | Career flow component (inline template) |
| `src/app/shared/group-connection-graph/group-connection-graph.component.ts` | Create | Group connection component (inline template) |
| `src/app/shared/global-group-map/global-group-map.component.ts` | Create | D3 force map component (inline template) |
| `src/app/pages/member-page/member-page.component.html` | Modify | Add `<app-member-career-graph>` |
| `src/app/pages/member-page/member-page.component.ts` | Modify | Import new component |
| `src/app/pages/group-page/group-page.component.html` | Modify | Add tabs + new graph components |
| `src/app/pages/group-page/group-page.component.ts` | Modify | Import new components, add tab state, load global data |

---

## Chunk 1: Shared Types & Data Transformation

### Task 1: Create graph-utils.ts

**Files:**
- Create: `src/app/shared/graph-utils.ts`

- [ ] **Step 1: Create the file with types and transformation functions**

```typescript
// src/app/shared/graph-utils.ts
import { History, Group } from '../models';

export interface CareerNode {
  historyId: string;
  groupId: string;
  groupName: string;
  memberName: string;   // name_at_time ?? member.name
  joinedAt: string;     // formatted "YYYY.MM"
  leftAt: string | null;
  isCurrent: boolean;
  routePath: string;    // "/group/:id"
}

export interface CareerEdge {
  fromIndex: number;
  toIndex: number;
}

export interface MapNode {
  id: string;           // group id
  name: string;
  x: number;
  y: number;
  hasConnections: boolean;
  fx?: number | null;   // D3 fixed position (for drag)
  fy?: number | null;
}

export interface MapEdge {
  source: MapNode;
  target: MapNode;
  memberName: string;
}

/** Transform history[] (getByMember result) → CareerNode[] + CareerEdge[] */
export function buildCareerGraph(histories: History[]): {
  nodes: CareerNode[];
  edges: CareerEdge[];
} {
  const sorted = [...histories].sort(
    (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  );

  const nodes: CareerNode[] = sorted.map(h => ({
    historyId: h.id,
    groupId: h.group_id,
    groupName: h.group?.name ?? '—',
    memberName: h.name_at_time ?? '—',
    joinedAt: h.joined_at.slice(0, 7).replace('-', '.'),
    leftAt: h.left_at ? h.left_at.slice(0, 7).replace('-', '.') : null,
    isCurrent: !h.left_at,
    routePath: `/group/${h.group_id}`,
  }));

  const edges: CareerEdge[] = nodes.slice(0, -1).map((_, i) => ({
    fromIndex: i,
    toIndex: i + 1,
  }));

  return { nodes, edges };
}

/** Transform histories (getByGroup result) → incoming/outgoing connections */
export interface ConnectionGroup {
  groupId: string;
  groupName: string;
  memberName: string;
  date: string;
  direction: 'in' | 'out';
  historyId: string;
}

export function buildGroupConnections(
  histories: History[],
  currentGroupId: string
): ConnectionGroup[] {
  const result: ConnectionGroup[] = [];

  // Group by member_id to find previous/next groups
  const byMember = new Map<string, History[]>();
  for (const h of histories) {
    const list = byMember.get(h.member_id) ?? [];
    list.push(h);
    byMember.set(h.member_id, list);
  }
  // Note: getByGroup only returns history for the current group.
  // We need histories for all members across all groups for full connections.
  // For now, mark all as current group entries — caller provides pre-built connections.
  return result;
}

/** Build global map from all groups + all histories */
export function buildGlobalMap(
  groups: Group[],
  histories: History[]
): { nodes: MapNode[]; edges: MapEdge[] } {
  // Build nodes (one per group)
  const nodeMap = new Map<string, MapNode>();
  for (const g of groups) {
    nodeMap.set(g.id, {
      id: g.id,
      name: g.name,
      x: Math.random() * 800,
      y: Math.random() * 500,
      hasConnections: false,
    });
  }

  // Build edges by grouping histories per member and finding consecutive groups
  const byMember = new Map<string, History[]>();
  for (const h of histories) {
    const list = byMember.get(h.member_id) ?? [];
    list.push(h);
    byMember.set(h.member_id, list);
  }

  const edges: MapEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const [, memberHistories] of byMember) {
    const sorted = [...memberHistories].sort(
      (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      const fromNode = nodeMap.get(from.group_id);
      const toNode = nodeMap.get(to.group_id);
      if (!fromNode || !toNode || from.group_id === to.group_id) continue;

      // Mark nodes as connected
      fromNode.hasConnections = true;
      toNode.hasConnections = true;

      // Deduplicate edges (same group pair = one edge)
      const key = `${from.group_id}→${to.group_id}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({
          source: fromNode,
          target: toNode,
          memberName: (from as any).member?.name ?? '—',
        });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/shared/graph-utils.ts
git commit -m "feat(graph): add shared graph types and transformation utilities"
```

---

## Chunk 2: MemberCareerGraphComponent

### Task 2: Create member-career-graph component

**Files:**
- Create: `src/app/shared/member-career-graph/member-career-graph.component.ts`

- [ ] **Step 1: Create the component**

```typescript
// src/app/shared/member-career-graph/member-career-graph.component.ts
import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { History } from '../../models';
import { buildCareerGraph, CareerNode, CareerEdge } from '../graph-utils';

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
                    <marker id="arr-{{ i }}" markerWidth="6" markerHeight="6"
                      refX="5" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L6,3 z" fill="#f472b6"/>
                    </marker>
                  </defs>
                  <line x1="0" y1="10" x2="26" y2="10"
                    stroke="#f472b6" stroke-width="1.5"
                    [attr.marker-end]="'url(#arr-' + i + ')'"/>
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
  nodes: CareerNode[] = [];
  edges: CareerEdge[] = [];

  constructor(private router: Router) {}

  ngOnChanges() {
    const { nodes, edges } = buildCareerGraph(this.histories);
    this.nodes = nodes;
    this.edges = edges;
  }

  navigate(path: string) {
    this.router.navigateByUrl(path);
  }
}
```

- [ ] **Step 2: Add to member-page component**

In `src/app/pages/member-page/member-page.component.ts`, add to imports array:
```typescript
import { MemberCareerGraphComponent } from '../../shared/member-career-graph/member-career-graph.component';
// Add to @Component imports: [..., MemberCareerGraphComponent]
```

- [ ] **Step 3: Add to member-page template**

In `src/app/pages/member-page/member-page.component.html`, find the `<app-member-timeline>` usage and add the career graph **above** it, inside a new section:

```html
<!-- Career graph section -->
<section class="mt-8 px-4 sm:px-6">
  <h2 class="text-xs font-semibold tracking-widest text-pink-400 uppercase mb-4">
    Career · キャリア
  </h2>
  <app-member-career-graph [histories]="histories" />
</section>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/member-career-graph/member-career-graph.component.ts
git add src/app/pages/member-page/member-page.component.ts
git add src/app/pages/member-page/member-page.component.html
git commit -m "feat(graph): add MemberCareerGraphComponent to member detail page"
```

---

## Chunk 3: GroupConnectionGraphComponent

### Task 3: Add member_histories to HistoryService.getByGroup

The current `getByGroup()` only fetches the target group's records. For group connections we need cross-group history for each member. Add a new method.

**Files:**
- Modify: `src/app/core/history.service.ts`

- [ ] **Step 1: Add getByMembers method**

```typescript
/** Get all history records for a list of member IDs (cross-group lookup) */
async getByMembers(memberIds: string[]): Promise<History[]> {
  if (memberIds.length === 0) return [];
  const { data, error } = await this.db
    .from('history')
    .select('*, group:groups(id,name,color), member:members(name)')
    .in('member_id', memberIds)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Create GroupConnectionGraphComponent**

Create `src/app/shared/group-connection-graph/group-connection-graph.component.ts`:

```typescript
// src/app/shared/group-connection-graph/group-connection-graph.component.ts
import { Component, Input, OnChanges } from '@angular/core';
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
          <marker id="cin" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#f9a8d4"/>
          </marker>
        </defs>
        @for (entry of incoming; track $index; let i = $index) {
          <line
            x1="0" [attr.y1]="(i + 0.5) * 60"
            x2="48" [attr.y2]="Math.max(incoming.length, 1) * 30"
            stroke="#f9a8d4" stroke-width="1.5" marker-end="url(#cin)"/>
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
          <marker id="cout" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#f9a8d4"/>
          </marker>
        </defs>
        @for (entry of outgoing; track $index; let i = $index) {
          <line
            x1="6" [attr.y1]="Math.max(outgoing.length, 1) * 30"
            x2="54" [attr.y2]="(i + 0.5) * 60"
            stroke="#f9a8d4" stroke-width="1.5" marker-end="url(#cout)"/>
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

  ngOnChanges() {
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

        const memberName = (h as any).member?.name ?? '—';

        // Previous group → this group (incoming)
        if (i > 0) {
          const prev = memberHistory[i - 1];
          if (prev.group_id !== this.groupId) {
            const key = `${prev.group_id}:${memberId}`;
            incomingMap.set(key, {
              groupId: prev.group_id,
              groupName: (prev as any).group?.name ?? '—',
              memberName,
              date: h.joined_at.slice(0, 7).replace('-', '.'),
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
              groupName: (next as any).group?.name ?? '—',
              memberName,
              date: (h.left_at ?? '').slice(0, 7).replace('-', '.'),
            });
          }
        }
      }
    }

    this.incoming = Array.from(incomingMap.values());
    this.outgoing = Array.from(outgoingMap.values());
  }
}
```

- [ ] **Step 3: Integrate into group-page**

In `src/app/pages/group-page/group-page.component.ts`:
1. Import `GroupConnectionGraphComponent` and `HistoryService`
2. Add properties:
```typescript
allMemberHistories: History[] = [];
activeTab: 'members' | 'connections' | 'map' = 'members';
```
3. After loading `histories`, fetch cross-group data:
```typescript
const memberIds = [...new Set(this.histories.map(h => h.member_id))];
this.allMemberHistories = await this.historyService.getByMembers(memberIds);
```

- [ ] **Step 4: Add to group-page template**

Add tabs and the component to `src/app/pages/group-page/group-page.component.html` after the Gantt chart section:

```html
<!-- Tabs -->
<div class="mt-10 px-4 sm:px-6">
  <div class="flex gap-1 border-b border-gray-100 mb-6">
    <button (click)="activeTab = 'members'"
      class="px-4 py-2 text-sm font-medium transition-colors"
      [class.text-pink-500]="activeTab === 'members'"
      [class.border-b-2]="activeTab === 'members'"
      [class.border-pink-500]="activeTab === 'members'"
      [class.text-gray-400]="activeTab !== 'members'">
      成員一覽
    </button>
    <button (click)="activeTab = 'connections'"
      class="px-4 py-2 text-sm font-medium transition-colors"
      [class.text-pink-500]="activeTab === 'connections'"
      [class.border-b-2]="activeTab === 'connections'"
      [class.border-pink-500]="activeTab === 'connections'"
      [class.text-gray-400]="activeTab !== 'connections'">
      成員流動
    </button>
    <button (click)="activeTab = 'map'"
      class="px-4 py-2 text-sm font-medium transition-colors"
      [class.text-pink-500]="activeTab === 'map'"
      [class.border-b-2]="activeTab === 'map'"
      [class.border-pink-500]="activeTab === 'map'"
      [class.text-gray-400]="activeTab !== 'map'">
      全局地圖
    </button>
  </div>

  @if (activeTab === 'members') {
    <app-group-tree [histories]="histories" [teams]="teams" />
  }
  @if (activeTab === 'connections') {
    <app-group-connection-graph
      [groupHistories]="histories"
      [allMemberHistories]="allMemberHistories"
      [groupId]="group!.id"
      [groupName]="group!.name" />
  }
  @if (activeTab === 'map') {
    <app-global-group-map />
  }
</div>
```

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/group-connection-graph/group-connection-graph.component.ts
git add src/app/core/history.service.ts
git add src/app/pages/group-page/group-page.component.ts
git add src/app/pages/group-page/group-page.component.html
git commit -m "feat(graph): add GroupConnectionGraphComponent to group detail page"
```

---

## Chunk 4: GlobalGroupMapComponent

### Task 4: Create GlobalGroupMapComponent with D3 force layout

**Files:**
- Create: `src/app/shared/global-group-map/global-group-map.component.ts`

- [ ] **Step 1: Create the component**

```typescript
// src/app/shared/global-group-map/global-group-map.component.ts
import {
  Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import * as d3 from 'd3';
import { GroupService } from '../../core/group.service';
import { HistoryService } from '../../core/history.service';
import { buildGlobalMap, MapNode, MapEdge } from '../graph-utils';

@Component({
  selector: 'app-global-group-map',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative w-full" style="height: 600px; overflow: hidden; background: #fdf8fc; border: 1px solid #fce7f3; border-radius: 8px;">

      @if (loading) {
        <div class="absolute inset-0 flex items-center justify-center">
          <p class="text-sm text-gray-400">載入中…</p>
        </div>
      }

      <!-- SVG edges layer -->
      <svg class="absolute inset-0 w-full h-full" style="pointer-events:none;">
        <defs>
          <marker id="gmap-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#f9a8d4"/>
          </marker>
        </defs>
        @for (edge of edges; track $index) {
          <line
            [attr.x1]="edge.source.x" [attr.y1]="edge.source.y"
            [attr.x2]="edge.target.x" [attr.y2]="edge.target.y"
            stroke="#f9a8d4" stroke-width="1.5" marker-end="url(#gmap-arrow)"/>
        }
      </svg>

      <!-- HTML nodes layer -->
      @for (node of nodes; track node.id) {
        <button
          (click)="navigate(node.id)"
          (mousedown)="onDragStart($event, node)"
          class="absolute transform -translate-x-1/2 -translate-y-1/2 text-[11px] font-semibold px-2 py-1 whitespace-nowrap transition-shadow hover:shadow-md cursor-grab active:cursor-grabbing"
          [style.left.px]="node.x"
          [style.top.px]="node.y"
          [class.border-2]="node.hasConnections"
          [class.border-pink-400]="node.hasConnections"
          [class.bg-white]="node.hasConnections"
          [class.text-pink-800]="node.hasConnections"
          [class.border]="!node.hasConnections"
          [class.border-dashed]="!node.hasConnections"
          [class.border-gray-200]="!node.hasConnections"
          [class.bg-gray-50]="!node.hasConnections"
          [class.text-gray-300]="!node.hasConnections"
        >{{ node.name }}</button>
      }

    </div>
    <p class="text-xs text-gray-400 mt-2 text-center">節點可拖曳 ／ 點擊跳至團體頁面</p>
  `,
})
export class GlobalGroupMapComponent implements OnInit, OnDestroy {
  nodes: MapNode[] = [];
  edges: MapEdge[] = [];
  loading = true;

  private simulation: d3.Simulation<MapNode, MapEdge> | null = null;
  private dragging: MapNode | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private onMouseMove = this.handleMouseMove.bind(this);
  private onMouseUp = this.handleMouseUp.bind(this);

  constructor(
    private groupService: GroupService,
    private historyService: HistoryService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private router: Router,
  ) {}

  async ngOnInit() {
    const [groups, histories] = await Promise.all([
      this.groupService.getAll(),
      this.historyService.getAll(),
    ]);

    const { nodes, edges } = buildGlobalMap(groups, histories);
    this.nodes = nodes;
    this.edges = edges;
    this.loading = false;
    this.cdr.detectChanges();

    // Run D3 outside Angular zone to avoid unnecessary CD cycles
    this.zone.runOutsideAngular(() => {
      this.simulation = d3.forceSimulation<MapNode>(this.nodes)
        .force('link', d3.forceLink<MapNode, MapEdge>(this.edges)
          .id(d => d.id).distance(180))
        .force('charge', d3.forceManyBody().strength(-250))
        .force('center', d3.forceCenter(400, 300))
        .force('collision', d3.forceCollide(60))
        .on('tick', () => {
          this.zone.run(() => this.cdr.detectChanges());
        })
        .on('end', () => {
          this.zone.run(() => this.cdr.detectChanges());
        });
    });

    // Drag listeners on window
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  ngOnDestroy() {
    this.simulation?.stop();
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  }

  navigate(groupId: string) {
    if (!this.dragging) {
      this.router.navigate(['/group', groupId]);
    }
  }

  onDragStart(event: MouseEvent, node: MapNode) {
    event.preventDefault();
    this.dragging = node;
    this.dragOffsetX = event.clientX - node.x;
    this.dragOffsetY = event.clientY - node.y;
    node.fx = node.x;
    node.fy = node.y;
    this.simulation?.alphaTarget(0.1).restart();
  }

  private handleMouseMove(event: MouseEvent) {
    if (!this.dragging) return;
    this.dragging.fx = event.clientX - this.dragOffsetX;
    this.dragging.fy = event.clientY - this.dragOffsetY;
  }

  private handleMouseUp() {
    if (this.dragging) {
      this.dragging.fx = null;
      this.dragging.fy = null;
      this.dragging = null;
      this.simulation?.alphaTarget(0);
    }
  }
}
```

- [ ] **Step 2: Add GlobalGroupMapComponent to group-page imports**

In `src/app/pages/group-page/group-page.component.ts`, add to imports:
```typescript
import { GlobalGroupMapComponent } from '../../shared/global-group-map/global-group-map.component';
// Add to @Component imports: [..., GlobalGroupMapComponent]
```

- [ ] **Step 3: Verify the map tab renders**

Run the dev server and navigate to any group page. Click「全局地圖」tab. Verify:
- Nodes appear and spread out via D3 force
- Nodes with connections show pink border
- Isolated nodes show gray dashed border
- Dragging a node works
- Clicking a node navigates to that group

```bash
ng serve
# Open http://localhost:4200/group/<any-id>
# Click 全局地圖 tab
```

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/global-group-map/global-group-map.component.ts
git add src/app/pages/group-page/group-page.component.ts
git commit -m "feat(graph): add GlobalGroupMapComponent with D3 force layout"
```

---

## Final Verification

- [ ] Build passes: `ng build`
- [ ] Member page shows career graph above timeline
- [ ] Group page has 3 tabs (成員一覽 / 成員流動 / 全局地圖)
- [ ] 成員流動 tab shows incoming/outgoing connections
- [ ] 全局地圖 shows all groups, D3 force positions them
- [ ] Clicking any node navigates correctly

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat(graph): complete reincarnation graph implementation"
```
