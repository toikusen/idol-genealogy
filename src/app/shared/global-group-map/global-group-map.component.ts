// src/app/shared/global-group-map/global-group-map.component.ts
import {
  Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, NgZone, ElementRef
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
          <marker [attr.id]="'gmap-arr-' + instanceId" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#f9a8d4"/>
          </marker>
        </defs>
        @for (edge of edges; track $index) {
          <line
            [attr.x1]="asNode(edge.source).x" [attr.y1]="asNode(edge.source).y"
            [attr.x2]="asNode(edge.target).x" [attr.y2]="asNode(edge.target).y"
            stroke="#f9a8d4" stroke-width="1.5" [attr.marker-end]="'url(#gmap-arr-' + instanceId + ')'"/>
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

  readonly instanceId = Math.random().toString(36).slice(2, 7);

  private simulation: d3.Simulation<MapNode, MapEdge> | null = null;
  private dragging: MapNode | null = null;
  private didDrag = false;
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
    private el: ElementRef,
  ) {}

  /** Helper to cast SimulationLinkDatum source/target to MapNode at runtime */
  asNode(n: MapNode | string | number): MapNode {
    return n as MapNode;
  }

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
      const containerEl = this.el.nativeElement as HTMLElement;
      const containerWidth = containerEl.offsetWidth || 800;
      const containerHeight = containerEl.offsetHeight || 600;

      this.simulation = d3.forceSimulation<MapNode>(this.nodes)
        .force('link', d3.forceLink<MapNode, MapEdge>(this.edges)
          .id(d => d.id).distance(180))
        .force('charge', d3.forceManyBody().strength(-250))
        .force('center', d3.forceCenter(containerWidth / 2, containerHeight / 2))
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
    if (!this.didDrag) {
      this.router.navigate(['/group', groupId]);
    }
  }

  onDragStart(event: MouseEvent, node: MapNode) {
    event.preventDefault();
    this.dragging = node;
    const rect = (this.el.nativeElement as HTMLElement).getBoundingClientRect();
    this.dragOffsetX = (event.clientX - rect.left) - node.x!;
    this.dragOffsetY = (event.clientY - rect.top) - node.y!;
    node.fx = node.x;
    node.fy = node.y;
    this.simulation?.alphaTarget(0.1).restart();
  }

  private handleMouseMove(event: MouseEvent) {
    if (!this.dragging) return;
    this.didDrag = true;
    const rect = (this.el.nativeElement as HTMLElement).getBoundingClientRect();
    this.dragging.fx = (event.clientX - rect.left) - this.dragOffsetX;
    this.dragging.fy = (event.clientY - rect.top) - this.dragOffsetY;
  }

  private handleMouseUp() {
    if (this.dragging) {
      this.dragging.fx = null;
      this.dragging.fy = null;
      this.dragging = null;
      this.simulation?.alphaTarget(0);
    }
    setTimeout(() => { this.didDrag = false; }, 0);
  }
}
