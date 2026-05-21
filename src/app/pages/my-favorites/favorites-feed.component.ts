import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';

interface FeedEntry {
  id: string;
  eventType: 'event' | 'song' | 'member_change';
  entityName: string;
  title: string;
  occurredAt: string;
  link?: string;
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
              <div style="font-size:0.63rem;color:var(--text-primary);line-height:1.4;margin-bottom:2px;">{{ item.title }}</div>
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

  async ngOnInit(): Promise<void> {
    await this.loadFeed();
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
          link: `/group/${s.group?.id}`,
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
        }));
      }

      if (memberIds.length) {
        const { data: hist } = await this.supabase.client
          .from('history')
          .select('id, status, updated_at, member:members(id, name)')
          .in('member_id', memberIds)
          .in('status', ['active', 'graduated', 'withdrawn', 'hiatus'])
          .order('updated_at', { ascending: false })
          .limit(10);
        (hist ?? []).forEach((h: any) => entries.push({
          id: `hist-${h.id}`,
          eventType: 'member_change',
          entityName: h.member?.name ?? '',
          title: this.statusLabel(h.status),
          occurredAt: h.updated_at,
        }));
      }

      if (groupIds.length) {
        const { data: events } = await this.supabase.client
          .from('group_events')
          .select('id, title, starts_at, group_id, groups(name)')
          .in('group_id', groupIds)
          .order('first_seen_at', { ascending: false })
          .limit(20);
        (events ?? []).forEach((e: any) => entries.push({
          id: `evt-${e.id}`,
          eventType: 'event',
          entityName: e.groups?.name ?? '',
          title: e.title,
          occurredAt: e.starts_at,
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
    return type === 'event' ? '📅' : type === 'song' ? '🎵' : '⚡';
  }
  iconBg(type: string): string {
    return type === 'event' ? 'rgba(232,121,160,0.12)'
      : type === 'song' ? 'rgba(147,197,253,0.15)'
      : 'rgba(192,132,252,0.12)';
  }
  iconBorder(type: string): string {
    return type === 'event' ? 'rgba(232,121,160,0.25)'
      : type === 'song' ? 'rgba(147,197,253,0.35)'
      : 'rgba(192,132,252,0.3)';
  }
  tagBg(type: string): string { return 'transparent'; }
  tagColor(type: string): string {
    return type === 'event' ? 'rgba(232,121,160,0.8)'
      : type === 'song' ? '#3b82f6'
      : '#7c3aed';
  }
  tagLabel(type: string): string {
    return type === 'event' ? '活動' : type === 'song' ? '新歌' : '異動';
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
  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      graduated: '畢業', withdrawn: '退出', hiatus: '休息', active: '復歸'
    };
    return `成員狀態更新：${map[status] ?? status}`;
  }
}
