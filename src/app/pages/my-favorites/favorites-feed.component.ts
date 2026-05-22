import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';

interface FeedEntry {
  id: string;
  eventType: 'event' | 'song' | 'member_change' | 'member_join' | 'group_change';
  entityName: string;
  title: string;
  occurredAt: string;
  link?: string;
}

interface HistoryStatusAudit {
  oldStatus: string | null;
  newStatus: string | null;
  changedAt: string;
}

@Component({
  selector: 'app-favorites-feed',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div style="padding:10px 20px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:0.55rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);">最新動態</div>
        @if (newCount() > 0) {
          <span style="font-size:0.52rem;padding:1px 7px;background:rgba(232,121,160,0.12);border:1px solid rgba(232,121,160,0.22);border-radius:10px;color:rgba(232,121,160,1);">
            ● {{ newCount() }} 則新動態
          </span>
        }
      </div>

      @if (loading()) {
        <div style="text-align:center;padding:40px 0;color:var(--text-faint-40);font-size:0.8rem;">載入中…</div>
      } @else if (items().length === 0) {
        <div style="text-align:center;padding:40px 0;color:var(--text-faint-40);font-size:0.8rem;">
          還沒有動態，先追蹤一些團體或成員吧！
        </div>
      } @else {
        @for (item of items(); track item.id) {
          <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid rgba(232,121,160,0.07);align-items:flex-start;">
            <div [style.background]="iconBg(item.eventType)"
                 [style.border]="'1px solid ' + iconBorder(item.eventType)"
                 style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.65rem;">
              {{ iconEmoji(item.eventType) }}
            </div>
            <div style="flex:1;">
              <div style="font-size:0.58rem;font-weight:600;color:rgba(232,121,160,1);margin-bottom:1px;">{{ item.entityName }}</div>
              @if (item.link) {
                <a [routerLink]="item.link" style="display:block;font-size:0.63rem;color:var(--text-primary);line-height:1.4;margin-bottom:2px;text-decoration:none;">
                  {{ item.title }}
                </a>
              } @else {
                <div style="font-size:0.63rem;color:var(--text-primary);line-height:1.4;margin-bottom:2px;">{{ item.title }}</div>
              }
              <div style="font-size:0.52rem;color:var(--text-faint-55);">
                {{ formatTime(item.occurredAt) }}
                <span [style.background]="tagBg(item.eventType)"
                      [style.color]="tagColor(item.eventType)"
                      style="margin-left:4px;font-size:0.5rem;padding:0 5px;border-radius:5px;border:1px solid currentColor;">
                  {{ tagLabel(item.eventType) }}
                </span>
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class FavoritesFeedComponent implements OnInit, OnChanges {
  @Input() filter?: string;

  private favService = inject(FavoritesService);
  private supabase = inject(SupabaseService);

  readonly loading = signal(true);
  readonly items = signal<FeedEntry[]>([]);
  readonly newCount = signal(0);

  private _effectReady = false;

  constructor() {
    effect(() => {
      // Establish reactive dependency — re-run when favorites change
      this.favService.favoriteIds('group');
      this.favService.favoriteIds('member');
      if (this._effectReady) void this.loadFeed();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadFeed();
    this._effectReady = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filter'] && !changes['filter'].firstChange) {
      this.loadFeed();
    }
  }

  private async loadFeed(): Promise<void> {
    this.loading.set(true);
    try {
      const groupIds = this.filter === 'member' ? [] : this.favService.favoriteIds('group');
      const memberIds = this.filter === 'group' ? [] : this.favService.favoriteIds('member');
      const entries: FeedEntry[] = [];

      if (groupIds.length) {
        const { data: songs } = await this.supabase.client
          .from('group_songs')
          .select('id, title, created_at, group:groups(id, name)')
          .in('group_id', groupIds)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(20);
        (songs ?? []).forEach((s: any) => entries.push({
          id: `song-${s.id}`,
          eventType: 'song',
          entityName: s.group?.name ?? '',
          title: `新增歌曲《${s.title}》`,
          occurredAt: s.created_at,
          link: s.group?.id ? `/group/${s.group.id}` : undefined,
        }));
      }

      if (memberIds.length) {
        const { data: mSongs } = await this.supabase.client
          .from('member_songs')
          .select('id, title, created_at, member:members(id, name)')
          .in('member_id', memberIds)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(10);
        (mSongs ?? []).forEach((s: any) => entries.push({
          id: `msong-${s.id}`,
          eventType: 'song',
          entityName: s.member?.name ?? '',
          title: `新增歌曲《${s.title}》`,
          occurredAt: s.created_at,
          link: s.member?.id ? `/member/${s.member.id}` : undefined,
        }));
      }

      if (memberIds.length) {
        const { data: hist } = await this.supabase.client
          .from('history')
          .select('id, status, created_at, updated_at, external_group_name, external_country, member:members(id, name), group:groups(id, name)')
          .in('member_id', memberIds)
          .order('created_at', { ascending: false })
          .limit(20);
        const historyRows = hist ?? [];
        const statusAudits = await this.loadHistoryStatusAudits(historyRows.map((h: any) => h.id));
        historyRows.forEach((h: any) => {
          const groupName = h.group?.name ?? h.external_group_name ?? undefined;
          const isNewMembership =
            new Date(h.updated_at).getTime() - new Date(h.created_at).getTime() < 2000;
          if (isNewMembership) {
            entries.push({
              id: `join-${h.id}`,
              eventType: 'member_join',
              entityName: h.member?.name ?? '',
              title: `新增紀錄：${this.statusLabel(h.status, groupName, { isNewMembership })}`,
              occurredAt: h.created_at,
              link: h.member?.id ? `/member/${h.member.id}` : undefined,
            });
          } else if (h.status !== 'active') {
            entries.push({
              id: `hist-${h.id}`,
              eventType: 'member_change',
              entityName: h.member?.name ?? '',
              title: `編輯記錄：${this.statusLabel(h.status, groupName)}`,
              occurredAt: h.updated_at,
              link: h.member?.id ? `/member/${h.member.id}` : undefined,
            });
          } else {
            const audit = statusAudits.get(h.id);
            entries.push({
              id: `hist-${h.id}`,
              eventType: 'member_change',
              entityName: h.member?.name ?? '',
              title: `編輯記錄：${this.statusLabel('active', groupName, { audit })}`,
              occurredAt: audit?.changedAt ?? h.updated_at,
              link: h.member?.id ? `/member/${h.member.id}` : undefined,
            });
          }
        });
      }

      if (groupIds.length) {
        const { data: events } = await this.supabase.client
          .from('group_events')
          .select('id, title, first_seen_at, group_id, groups(name)')
          .in('group_id', groupIds)
          .order('first_seen_at', { ascending: false })
          .limit(20);
        (events ?? []).forEach((e: any) => entries.push({
          id: `evt-${e.id}`,
          eventType: 'event',
          entityName: e.groups?.name ?? '',
          title: e.title,
          occurredAt: e.first_seen_at,
          link: `/group/${e.group_id}`,
        }));

        const { data: disbanded } = await this.supabase.client
          .from('groups')
          .select('id, name, disbanded_at')
          .in('id', groupIds)
          .not('disbanded_at', 'is', null);
        (disbanded ?? []).forEach((g: any) => entries.push({
          id: `disbanded-${g.id}`,
          eventType: 'group_change',
          entityName: g.name,
          title: '團體宣告解散',
          occurredAt: g.disbanded_at,
          link: `/group/${g.id}`,
        }));
      }

      entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      this.items.set(entries);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  iconEmoji(type: string): string {
    if (type === 'event') return '📅';
    if (type === 'song') return '🎵';
    if (type === 'group_change') return '🏳️';
    if (type === 'member_join') return '✨';
    return '⚡';
  }
  iconBg(type: string): string {
    if (type === 'event') return 'rgba(232,121,160,0.12)';
    if (type === 'song') return 'rgba(147,197,253,0.15)';
    if (type === 'group_change') return 'rgba(148,163,184,0.15)';
    if (type === 'member_join') return 'rgba(52,211,153,0.12)';
    return 'rgba(192,132,252,0.12)';
  }
  iconBorder(type: string): string {
    if (type === 'event') return 'rgba(232,121,160,0.25)';
    if (type === 'song') return 'rgba(147,197,253,0.35)';
    if (type === 'group_change') return 'rgba(148,163,184,0.35)';
    if (type === 'member_join') return 'rgba(52,211,153,0.3)';
    return 'rgba(192,132,252,0.3)';
  }
  tagBg(type: string): string { return 'transparent'; }
  tagColor(type: string): string {
    if (type === 'event') return 'rgba(232,121,160,0.8)';
    if (type === 'song') return '#3b82f6';
    if (type === 'group_change') return '#64748b';
    if (type === 'member_join') return '#10b981';
    return '#7c3aed';
  }
  tagLabel(type: string): string {
    if (type === 'event') return '活動';
    if (type === 'song') return '新歌';
    if (type === 'group_change') return '團體';
    if (type === 'member_join') return '新增';
    return '異動';
  }
  formatTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return '剛才';
    if (h < 24) return `${h} 小時前`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} 天前`;
    return new Date(iso).toLocaleDateString('zh-TW');
  }
  private async loadHistoryStatusAudits(historyIds: string[]): Promise<Map<string, HistoryStatusAudit>> {
    if (historyIds.length === 0) return new Map();
    const { data, error } = await this.supabase.client
      .from('audit_log')
      .select('record_id, created_at, old_data, new_data')
      .eq('table_name', 'history')
      .eq('operation', 'UPDATE')
      .in('record_id', historyIds)
      .order('created_at', { ascending: false })
      .limit(100);

    const audits = new Map<string, HistoryStatusAudit>();
    if (error) return audits;

    (data ?? []).forEach((log: any) => {
      if (audits.has(log.record_id)) return;
      const oldStatus = log.old_data?.status ?? null;
      const newStatus = log.new_data?.status ?? null;
      if (oldStatus === newStatus) return;
      audits.set(log.record_id, {
        oldStatus,
        newStatus,
        changedAt: log.created_at,
      });
    });
    return audits;
  }

  private statusLabel(
    status: string,
    groupName?: string,
    context: { isNewMembership?: boolean; audit?: HistoryStatusAudit } = {},
  ): string {
    const g = groupName ? `《${groupName}》` : '';
    const solo = !groupName;
    if (status === 'active') {
      if (context.isNewMembership) return solo ? '個人出道' : `在${g}正常在籍`;
      if (context.audit?.oldStatus === 'hiatus' && context.audit.newStatus === 'active') return solo ? '個人復歸' : `從${g}復歸`;
      return solo ? '個人活動中' : `更新為${g}正常在籍`;
    }
    if (solo) {
      const soloMap: Record<string, string> = {
        graduated: '結束個人活動',
        withdrawn: '結束個人活動',
        hiatus: '個人活休',
        transferred: '結束個人活動',
        concurrent: '兼任其他組合',
        support: '支援其他組合',
      };
      return soloMap[status] ?? status;
    }
    const map: Record<string, string> = {
      graduated: `從${g}畢業`,
      withdrawn: `從${g}退出`,
      hiatus: `在${g}活休`,
      transferred: `從${g}轉組`,
      concurrent: `兼任${g}`,
      support: `支援${g}`,
    };
    return map[status] ?? status;
  }
}
