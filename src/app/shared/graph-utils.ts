// src/app/shared/graph-utils.ts
import * as d3 from 'd3';
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

export interface MapEdge extends d3.SimulationLinkDatum<MapNode> {
  memberName: string;
}

/** Transform history[] (getByMember result) → CareerNode[] + CareerEdge[] */
export function buildCareerGraph(histories: History[], fallbackName = ''): {
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
    memberName: h.name_at_time || h.member?.name || h.member?.name_roman || fallbackName || '—',
    joinedAt: h.joined_at.slice(0, 7).replaceAll('-', '.'),
    leftAt: h.left_at ? h.left_at.slice(0, 7).replaceAll('-', '.') : null,
    isCurrent: !h.left_at || new Date(h.left_at).getTime() > Date.now(),
    routePath: `/group/${h.group_id}`,
  }));

  const edges: CareerEdge[] = nodes.slice(0, -1).map((_, i) => ({
    fromIndex: i,
    toIndex: i + 1,
  }));

  return { nodes, edges };
}

/** Build global map from all groups + all histories */
export function buildGlobalMap(
  groups: Group[],
  histories: History[]
): { nodes: MapNode[]; edges: MapEdge[] } {
  // Build nodes (one per group)
  const nodeMap = new Map<string, MapNode>();
  groups.forEach((g, index) => {
    nodeMap.set(g.id, {
      id: g.id,
      name: g.name,
      x: (index % 10) * 100 + 50,
      y: Math.floor(index / 10) * 100 + 50,
      hasConnections: false,
    });
  });

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

      // Directed edge: A→B and B→A are treated as distinct (shows transfer direction)
      // Deduplicate edges (same group pair = one edge)
      const key = `${from.group_id}→${to.group_id}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({
          source: fromNode,
          target: toNode,
          memberName: from.member?.name ?? '—',
        });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}
