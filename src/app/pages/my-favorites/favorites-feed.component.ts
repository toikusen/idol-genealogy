import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';

interface FeedEntry {
  id: string;
  eventType: 'event' | 'song' | 'member_change' | 'member_join' | 'group_change';
  entityId: string;
  entityType: 'group' | 'member';
  entityName: string;
  photoUrl: string | null;
  title: string;
  occurredAt: string;
  link?: string;
  isNew: boolean;
}

interface FeedGroup {
  label: string;
  items: FeedEntry[];
}

interface BirthdayItem {
  memberId: string;
  memberName: string;
  photoUrl: string | null;
  initials: string;
  daysUntil: number;
  link: string;
}

interface HistoryStatusAudit {
  oldStatus: string | null;
  newStatus: string | null;
  changedAt: string;
}

type TypeFilter = 'all' | 'event' | 'song' | 'member';

interface TableCursors {
  groupSongs?: string;
  memberSongs?: string;
  history?: string;
  groupEvents?: string;
  disbanded?: string;
}

const LAST_VISITED_KEY = 'favorites_feed_last_visited';
const PAGE_LIMIT = 20;
const BIRTHDAY_DAYS = 14;

@Component({
  selector: 'app-favorites-feed',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    @keyframes shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position:  200% 0; }
    }
    .skel {
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0.04) 25%,
        rgba(255,255,255,0.09) 50%,
        rgba(255,255,255,0.04) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.6s infinite;
      border-radius: 4px;
    }
  `],
  template: `
    <!-- Realtime banner -->
    @if (newDataAvailable()) {
      <button (click)="onRefreshClick()"
        style="display:block;width:100%;padding:9px;text-align:center;background:rgba(232,121,160,0.08);border:none;border-bottom:1px solid rgba(232,121,160,0.15);color:rgba(232,121,160,1);font-size:0.78rem;cursor:pointer;font-family:var(--font-sans);letter-spacing:0.02em;">
        ● 有新動態，點此更新
      </button>
    }

    <div style="padding:10px 20px 0;">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);">最新動態</div>
        <div style="display:flex;align-items:center;gap:8px;">
          @if (newCount() > 0) {
            <span style="font-size:0.68rem;padding:2px 8px;background:rgba(232,121,160,0.12);border:1px solid rgba(232,121,160,0.22);border-radius:10px;color:rgba(232,121,160,1);">
              ● {{ newCount() }} 則新動態
            </span>
            <button (click)="markAllRead()"
              style="font-size:0.65rem;padding:2px 8px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:var(--text-faint-55);cursor:pointer;font-family:var(--font-sans);">
              全部已讀
            </button>
          }
        </div>
      </div>

      <!-- Type filter chips -->
      <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
        @for (chip of typeChips; track chip.value) {
          <button (click)="typeFilter.set(chip.value)"
            [style.background]="typeFilter() === chip.value ? 'rgba(232,121,160,0.15)' : 'transparent'"
            [style.color]="typeFilter() === chip.value ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
            [style.border]="typeFilter() === chip.value ? '1px solid rgba(232,121,160,0.35)' : '1px solid rgba(255,255,255,0.1)'"
            style="padding:4px 12px;border-radius:20px;font-size:0.72rem;cursor:pointer;background:transparent;font-family:var(--font-sans);transition:all 0.15s;">
            {{ chip.label }}
          </button>
        }
      </div>

      <!-- Birthday widget -->
      @if (birthdayItems().length > 0) {
        <div style="margin:0 -20px 16px;padding:0 20px;">
          <div style="font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-faint-40);margin-bottom:8px;">即將生日</div>
          <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;">
            @for (b of birthdayItems(); track b.memberId) {
              <a [routerLink]="b.link"
                [style.background]="b.daysUntil === 0 ? 'rgba(232,121,160,0.14)' : 'rgba(232,121,160,0.07)'"
                [style.border]="b.daysUntil === 0 ? '1px solid rgba(232,121,160,0.4)' : '1px solid rgba(232,121,160,0.15)'"
                style="display:flex;align-items:center;gap:10px;flex-shrink:0;padding:9px 14px;border-radius:14px;text-decoration:none;min-width:150px;">
                <div
                  [style.background]="'linear-gradient(135deg,rgba(134,239,172,0.35),rgba(74,222,128,0.5))'"
                  style="width:34px;height:34px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:600;color:white;overflow:hidden;border:1.5px solid rgba(134,239,172,0.5);">
                  @if (b.photoUrl) {
                    <img [src]="b.photoUrl" [alt]="b.memberName" style="width:100%;height:100%;object-fit:cover;">
                  } @else {
                    {{ b.initials }}
                  }
                </div>
                <div>
                  <div style="font-size:0.78rem;font-weight:600;color:var(--text-primary);white-space:nowrap;">{{ b.memberName }}</div>
                  <div style="font-size:0.7rem;color:rgba(232,121,160,0.9);white-space:nowrap;">{{ birthdayLabel(b.daysUntil) }}</div>
                </div>
              </a>
            }
          </div>
        </div>
      }

      <!-- Skeleton -->
      @if (loading()) {
        @for (s of skeletons; track s) {
          <div style="display:flex;gap:12px;padding:11px 0;border-bottom:1px solid rgba(232,121,160,0.07);align-items:flex-start;">
            <div class="skel" style="width:32px;height:32px;border-radius:50%;flex-shrink:0;"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:7px;padding-top:3px;">
              <div class="skel" style="width:56px;height:9px;"></div>
              <div class="skel" style="width:80%;height:12px;"></div>
              <div class="skel" style="width:90px;height:9px;"></div>
            </div>
          </div>
        }

      <!-- Error -->
      } @else if (error()) {
        <div style="text-align:center;padding:48px 0;">
          <div style="font-size:1.4rem;margin-bottom:8px;color:var(--text-faint-40);">⚠</div>
          <div style="color:var(--text-faint-40);font-size:0.875rem;margin-bottom:16px;">動態載入失敗</div>
          <button (click)="retryLoad()"
            style="font-size:0.8rem;padding:6px 18px;background:rgba(232,121,160,0.1);border:1px solid rgba(232,121,160,0.25);border-radius:8px;color:rgba(232,121,160,1);cursor:pointer;font-family:var(--font-sans);">
            重新載入
          </button>
        </div>

      <!-- Empty -->
      } @else if (filteredGroupedItems().length === 0) {
        <div style="text-align:center;padding:40px 0;color:var(--text-faint-40);font-size:0.875rem;">
          {{ items().length === 0 ? emptyMessage : '此分類沒有動態' }}
        </div>

      <!-- Feed -->
      } @else {
        @for (group of filteredGroupedItems(); track group.label; let first = $first) {
          <div [style.padding-top]="first ? '0' : '10px'"
               [style.border-top]="first ? 'none' : '1px solid rgba(255,255,255,0.05)'"
               style="font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-faint-40);padding-bottom:4px;margin-bottom:2px;">
            {{ group.label }}
          </div>
          @for (item of group.items; track item.id) {
            <div [style.border-left]="item.isNew ? '2px solid rgba(232,121,160,0.55)' : '2px solid transparent'"
                 style="display:flex;gap:12px;padding:11px 0 11px 8px;border-bottom:1px solid rgba(232,121,160,0.07);align-items:center;">
              <!-- Entity avatar + event type dot -->
              <div style="position:relative;flex-shrink:0;">
                <div
                  [style.background]="item.entityType === 'group'
                    ? 'linear-gradient(135deg,rgba(232,121,160,0.28),rgba(192,80,128,0.38))'
                    : 'linear-gradient(135deg,rgba(134,239,172,0.28),rgba(74,222,128,0.42))'"
                  [style.border-color]="item.entityType === 'group' ? 'rgba(232,121,160,0.4)' : 'rgba(134,239,172,0.45)'"
                  style="width:36px;height:36px;border-radius:50%;border:1.5px solid;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;color:rgba(255,255,255,0.9);">
                  @if (item.photoUrl) {
                    <img [src]="item.photoUrl" [alt]="item.entityName" style="width:100%;height:100%;object-fit:cover;">
                  } @else {
                    {{ item.entityName.slice(0, 2) }}
                  }
                </div>
              </div>
              <div style="flex:1;">
                <div style="font-size:0.75rem;font-weight:600;color:rgba(232,121,160,1);margin-bottom:2px;">{{ item.entityName }}</div>
                @if (item.link) {
                  <a [routerLink]="item.link" style="display:block;font-size:0.85rem;color:var(--text-primary);line-height:1.45;margin-bottom:3px;text-decoration:none;">
                    {{ item.title }}
                  </a>
                } @else {
                  <div style="font-size:0.85rem;color:var(--text-primary);line-height:1.45;margin-bottom:3px;">{{ item.title }}</div>
                }
                <div style="font-size:0.7rem;color:var(--text-faint-55);">
                  {{ formatTime(item.occurredAt) }}
                  <span [style.color]="tagColor(item.eventType)"
                        style="margin-left:5px;font-size:0.65rem;padding:0 6px;border-radius:5px;border:1px solid currentColor;">
                    {{ tagLabel(item.eventType) }}
                  </span>
                </div>
              </div>
            </div>
          }
        }

        <!-- Load more -->
        @if (hasMore()) {
          <div style="text-align:center;padding:18px 0 8px;">
            <button (click)="loadMore()" [disabled]="loadingMore()"
              style="font-size:0.8rem;padding:7px 22px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:var(--text-faint-55);cursor:pointer;font-family:var(--font-sans);"
              [style.opacity]="loadingMore() ? '0.5' : '1'">
              {{ loadingMore() ? '載入中…' : '載入更多' }}
            </button>
          </div>
        }
      }
    </div>
  `,
})
export class FavoritesFeedComponent implements OnChanges, OnDestroy {
  @Input() filter?: string;

  private favService = inject(FavoritesService);
  private supabase = inject(SupabaseService);
  private readonly isBrowser = typeof window !== 'undefined';

  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal(false);
  readonly items = signal<FeedEntry[]>([]);
  readonly birthdayItems = signal<BirthdayItem[]>([]);
  readonly newCount = signal(0);
  readonly hasMore = signal(false);
  readonly newDataAvailable = signal(false);
  readonly typeFilter = signal<TypeFilter>('all');
  readonly skeletons = [1, 2, 3, 4];

  readonly typeChips: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'event', label: '活動' },
    { value: 'song', label: '新歌' },
    { value: 'member', label: '成員動態' },
  ];

  private realtimeChannel: RealtimeChannel | null = null;
  private _tableCursors: TableCursors = {};

  readonly groupedItems = computed<FeedGroup[]>(() => {
    const entries = this.items();
    if (!entries.length) return [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);

    const groups: FeedGroup[] = [
      { label: '今天', items: [] },
      { label: '昨天', items: [] },
      { label: '本週', items: [] },
      { label: '更早', items: [] },
    ];

    for (const item of entries) {
      const d = new Date(item.occurredAt);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (dayStart >= todayStart)          groups[0].items.push(item);
      else if (dayStart >= yesterdayStart) groups[1].items.push(item);
      else if (d >= weekStart)             groups[2].items.push(item);
      else                                 groups[3].items.push(item);
    }

    return groups.filter(g => g.items.length > 0);
  });

  readonly filteredGroupedItems = computed<FeedGroup[]>(() => {
    const tf = this.typeFilter();
    const groups = this.groupedItems();
    if (tf === 'all') return groups;

    const memberTypes = new Set(['member_change', 'member_join', 'group_change']);
    return groups
      .map(g => ({
        ...g,
        items: g.items.filter(item => {
          if (tf === 'event') return item.eventType === 'event';
          if (tf === 'song') return item.eventType === 'song';
          if (tf === 'member') return memberTypes.has(item.eventType);
          return true;
        }),
      }))
      .filter(g => g.items.length > 0);
  });

  get emptyMessage(): string {
    if (this.filter === 'group') return '尚未追蹤任何團體，點右上角「+」新增';
    if (this.filter === 'member') return '尚未追蹤任何成員，點右上角「+」新增';
    return '還沒有動態，先追蹤一些團體或成員吧！';
  }

  constructor() {
    effect(() => {
      this.favService.favoriteIds('group');
      this.favService.favoriteIds('member');
      void this.loadFeed();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filter'] && !changes['filter'].firstChange) {
      this.typeFilter.set('all');
      this.loadFeed();
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeRealtime();
  }

  retryLoad(): void {
    void this.loadFeed();
  }

  markAllRead(): void {
    if (this.isBrowser) localStorage.setItem(LAST_VISITED_KEY, new Date().toISOString());
    this.newCount.set(0);
    this.items.update(list => list.map(item => ({ ...item, isNew: false })));
  }

  loadMore(): void {
    if (this.loadingMore()) return;
    void this.appendPage();
  }

  onRefreshClick(): void {
    this.newDataAvailable.set(false);
    void this.loadFeed();
  }

  birthdayLabel(daysUntil: number): string {
    if (daysUntil === 0) return '🎂 今天生日！';
    if (daysUntil === 1) return '🎂 明天生日';
    return `🎂 ${daysUntil} 天後生日`;
  }

  private async loadFeed(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    this.hasMore.set(false);
    this._tableCursors = {};

    const previousVisit = this.isBrowser ? localStorage.getItem(LAST_VISITED_KEY) : null;
    if (this.isBrowser) localStorage.setItem(LAST_VISITED_KEY, new Date().toISOString());

    const groupIds = this.filter === 'member' ? [] : this.favService.favoriteIds('group');
    const memberIds = this.filter === 'group' ? [] : this.favService.favoriteIds('member');

    if (!memberIds.length) this.birthdayItems.set([]);

    try {
      const [entries] = await Promise.all([
        this.fetchEntries(groupIds, memberIds),
        memberIds.length ? this.loadBirthdays(memberIds) : Promise.resolve(),
      ]);

      if (previousVisit) {
        let count = 0;
        for (const e of entries) {
          if (e.occurredAt > previousVisit) { e.isNew = true; count++; }
        }
        this.newCount.set(count);
      }

      this.items.set(entries);
      this.hasMore.set(entries.length > 0);
      this.subscribeRealtime();
    } catch {
      this.error.set(true);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async appendPage(): Promise<void> {
    this.loadingMore.set(true);
    try {
      const groupIds = this.filter === 'member' ? [] : this.favService.favoriteIds('group');
      const memberIds = this.filter === 'group' ? [] : this.favService.favoriteIds('member');
      const entries = await this.fetchEntries(groupIds, memberIds);
      if (entries.length === 0) { this.hasMore.set(false); return; }
      const existingIds = new Set(this.items().map(e => e.id));
      const fresh = entries.filter(e => !existingIds.has(e.id));
      this.items.update(prev => [...prev, ...fresh]);
      this.hasMore.set(fresh.length > 0);
    } catch {
      // silently ignore
    } finally {
      this.loadingMore.set(false);
    }
  }

  private async loadBirthdays(memberIds: string[]): Promise<void> {
    const { data } = await this.supabase.client
      .from('members')
      .select('id, name, photo_url, birthdate')
      .in('id', memberIds)
      .not('birthdate', 'is', null);

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const items: BirthdayItem[] = [];

    for (const m of (data ?? [])) {
      const days = this.calcDaysUntilBirthday(m.birthdate, todayStart);
      if (days !== null && days <= BIRTHDAY_DAYS) {
        items.push({
          memberId: m.id,
          memberName: m.name,
          photoUrl: m.photo_url,
          initials: (m.name as string).slice(0, 2).toUpperCase(),
          daysUntil: days,
          link: `/member/${m.id}`,
        });
      }
    }
    this.birthdayItems.set(items.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 3));
  }

  private calcDaysUntilBirthday(birthdate: string, todayStart: Date): number | null {
    const m = birthdate.match(/(?:^\d{4}-)?(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const month = +m[1] - 1;
    const day = +m[2];
    let next = new Date(todayStart.getFullYear(), month, day);
    if (next < todayStart) next = new Date(todayStart.getFullYear() + 1, month, day);
    return Math.round((next.getTime() - todayStart.getTime()) / 86_400_000);
  }

  private async fetchEntries(groupIds: string[], memberIds: string[]): Promise<FeedEntry[]> {
    const entries: FeedEntry[] = [];

    if (groupIds.length) {
      let q = this.supabase.client
        .from('group_songs')
        .select('id, title, created_at, group:groups(id, name, photo_url)')
        .in('group_id', groupIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(PAGE_LIMIT);
      if (this._tableCursors.groupSongs) q = q.lt('created_at', this._tableCursors.groupSongs);
      const { data: songs } = await q;
      if (songs?.length) this._tableCursors.groupSongs = songs[songs.length - 1].created_at;
      (songs ?? []).forEach((s: any) => entries.push({
        id: `song-${s.id}`, eventType: 'song',
        entityId: s.group?.id ?? '', entityType: 'group',
        entityName: s.group?.name ?? '', photoUrl: s.group?.photo_url ?? null,
        title: `新增歌曲《${s.title}》`,
        occurredAt: s.created_at, link: s.group?.id ? `/group/${s.group.id}` : undefined, isNew: false,
      }));
    }

    if (memberIds.length) {
      let q = this.supabase.client
        .from('member_songs')
        .select('id, title, created_at, member:members(id, name, photo_url)')
        .in('member_id', memberIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(PAGE_LIMIT);
      if (this._tableCursors.memberSongs) q = q.lt('created_at', this._tableCursors.memberSongs);
      const { data: mSongs } = await q;
      if (mSongs?.length) this._tableCursors.memberSongs = mSongs[mSongs.length - 1].created_at;
      (mSongs ?? []).forEach((s: any) => entries.push({
        id: `msong-${s.id}`, eventType: 'song',
        entityId: s.member?.id ?? '', entityType: 'member',
        entityName: s.member?.name ?? '', photoUrl: s.member?.photo_url ?? null,
        title: `新增歌曲《${s.title}》`,
        occurredAt: s.created_at, link: s.member?.id ? `/member/${s.member.id}` : undefined, isNew: false,
      }));
    }

    if (memberIds.length) {
      let q = this.supabase.client
        .from('history')
        .select('id, status, created_at, updated_at, external_group_name, member:members(id, name, photo_url), group:groups(id, name)')
        .in('member_id', memberIds)
        .order('created_at', { ascending: false })
        .limit(PAGE_LIMIT);
      if (this._tableCursors.history) q = q.lt('created_at', this._tableCursors.history);
      const { data: hist } = await q;
      const historyRows = hist ?? [];
      if (historyRows.length) this._tableCursors.history = historyRows[historyRows.length - 1].created_at;
      const statusAudits = await this.loadHistoryStatusAudits(historyRows.map((h: any) => h.id));
      historyRows.forEach((h: any) => {
        const groupName = h.group?.name ?? h.external_group_name ?? undefined;
        const isNewMembership = new Date(h.updated_at).getTime() - new Date(h.created_at).getTime() < 2000;
        if (isNewMembership) {
          entries.push({ id: `join-${h.id}`, eventType: 'member_join',
            entityId: h.member?.id ?? '', entityType: 'member',
            entityName: h.member?.name ?? '', photoUrl: h.member?.photo_url ?? null,
            title: `新增歷程：${this.statusLabel(h.status, groupName, { isNewMembership })}`,
            occurredAt: h.created_at, link: h.member?.id ? `/member/${h.member.id}` : undefined, isNew: false });
        } else if (h.status !== 'active') {
          entries.push({ id: `hist-${h.id}`, eventType: 'member_change',
            entityId: h.member?.id ?? '', entityType: 'member',
            entityName: h.member?.name ?? '', photoUrl: h.member?.photo_url ?? null,
            title: `編輯歷程：${this.statusLabel(h.status, groupName)}`,
            occurredAt: h.updated_at, link: h.member?.id ? `/member/${h.member.id}` : undefined, isNew: false });
        } else {
          const audit = statusAudits.get(h.id);
          entries.push({ id: `hist-${h.id}`, eventType: 'member_change',
            entityId: h.member?.id ?? '', entityType: 'member',
            entityName: h.member?.name ?? '', photoUrl: h.member?.photo_url ?? null,
            title: `編輯歷程：${this.statusLabel('active', groupName, { audit })}`,
            occurredAt: audit?.changedAt ?? h.updated_at,
            link: h.member?.id ? `/member/${h.member.id}` : undefined, isNew: false });
        }
      });
    }

    if (groupIds.length) {
      let q = this.supabase.client
        .from('group_events')
        .select('id, title, first_seen_at, group_id, groups(id, name, photo_url)')
        .in('group_id', groupIds)
        .order('first_seen_at', { ascending: false })
        .limit(PAGE_LIMIT);
      if (this._tableCursors.groupEvents) q = q.lt('first_seen_at', this._tableCursors.groupEvents);
      const { data: events } = await q;
      if (events?.length) this._tableCursors.groupEvents = events[events.length - 1].first_seen_at;
      (events ?? []).forEach((e: any) => entries.push({
        id: `evt-${e.id}`, eventType: 'event',
        entityId: e.group_id, entityType: 'group',
        entityName: e.groups?.name ?? '', photoUrl: e.groups?.photo_url ?? null,
        title: e.title,
        occurredAt: e.first_seen_at, link: `/group/${e.group_id}`, isNew: false,
      }));

      let dq = this.supabase.client
        .from('groups')
        .select('id, name, disbanded_at, photo_url')
        .in('id', groupIds)
        .not('disbanded_at', 'is', null)
        .order('disbanded_at', { ascending: false })
        .limit(PAGE_LIMIT);
      if (this._tableCursors.disbanded) dq = dq.lt('disbanded_at', this._tableCursors.disbanded);
      const { data: disbanded } = await dq;
      if (disbanded?.length) this._tableCursors.disbanded = disbanded[disbanded.length - 1].disbanded_at;
      (disbanded ?? []).forEach((g: any) => entries.push({
        id: `disbanded-${g.id}`, eventType: 'group_change',
        entityId: g.id, entityType: 'group',
        entityName: g.name, photoUrl: g.photo_url ?? null,
        title: '團體宣告解散',
        occurredAt: g.disbanded_at, link: `/group/${g.id}`, isNew: false,
      }));
    }

    entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return entries;
  }

  private subscribeRealtime(): void {
    if (!this.isBrowser) return;
    this.unsubscribeRealtime();

    const groupIds = this.favService.favoriteIds('group');
    const memberIds = this.favService.favoriteIds('member');
    if (!groupIds.length && !memberIds.length) return;

    this.realtimeChannel = this.supabase.client
      .channel('favorites-feed-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_songs' }, (payload: any) => {
        if (groupIds.includes(payload.new?.group_id)) this.newDataAvailable.set(true);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'member_songs' }, (payload: any) => {
        if (memberIds.includes(payload.new?.member_id)) this.newDataAvailable.set(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'history' }, (payload: any) => {
        const id = (payload.new ?? payload.old)?.member_id;
        if (id && memberIds.includes(id)) this.newDataAvailable.set(true);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_events' }, (payload: any) => {
        if (groupIds.includes(payload.new?.group_id)) this.newDataAvailable.set(true);
      })
      .subscribe();
  }

  private unsubscribeRealtime(): void {
    if (this.realtimeChannel) {
      this.supabase.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

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
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return '剛才';
    if (h < 24) return `${h} 小時前`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} 天前`;
    return new Date(iso).toLocaleDateString('zh-TW');
  }

  private async loadHistoryStatusAudits(historyIds: string[]): Promise<Map<string, HistoryStatusAudit>> {
    if (!historyIds.length) return new Map();
    const { data, error } = await this.supabase.client
      .from('audit_log').select('record_id, created_at, old_data, new_data')
      .eq('table_name', 'history').eq('operation', 'UPDATE')
      .in('record_id', historyIds).order('created_at', { ascending: false }).limit(100);

    const audits = new Map<string, HistoryStatusAudit>();
    if (error) return audits;
    (data ?? []).forEach((log: any) => {
      if (audits.has(log.record_id)) return;
      const oldStatus = log.old_data?.status ?? null;
      const newStatus = log.new_data?.status ?? null;
      if (oldStatus === newStatus) return;
      audits.set(log.record_id, { oldStatus, newStatus, changedAt: log.created_at });
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
      if (context.isNewMembership) return solo ? '個人出道' : `加入${g}`;
      if (context.audit?.oldStatus === 'hiatus' && context.audit.newStatus === 'active') return solo ? '個人復歸' : `從${g}復歸`;
      return solo ? '個人活動中' : `更新為${g}活動中`;
    }
    if (solo) {
      const m: Record<string, string> = { graduated: '結束個人活動', withdrawn: '結束個人活動', hiatus: '個人活休', transferred: '結束個人活動', concurrent: '兼任其他組合', support: '支援其他組合' };
      return m[status] ?? status;
    }
    const m: Record<string, string> = { graduated: `從${g}畢業`, withdrawn: `從${g}退出`, hiatus: `在${g}活休`, transferred: `從${g}轉組`, concurrent: `兼任${g}`, support: `支援${g}` };
    return m[status] ?? status;
  }
}
