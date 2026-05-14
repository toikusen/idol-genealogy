# 場地 Phase 2：近期活動設計文件

**日期**：2026-05-14
**狀態**：已確認，待實作

---

## 概述

在現有場地 Tab（Phase 1）的基礎上，為每張場館卡片接入 Google Calendar 資料，顯示近期活動數量 badge，並在展開卡片時列出活動清單。

---

## 使用者情境

- 粉絲瀏覽場館列表，想知道哪些場館近期有活動
- 想快速跳到某場活動的 Google Calendar 頁面查看詳情
- 沒有活動的場館仍可展開查看地圖

---

## 行為規格

### 卡片展開

**所有場館卡片均可展開**，不論是否有活動。展開後顯示：

1. Google Maps iframe（既有）
2. Google Maps 外連按鈕（既有）
3. 近期活動清單（僅在有活動時顯示）

### Chip 狀態

| 狀態 | 外觀 | 可點擊 | 說明 |
|------|------|--------|------|
| Calendar 未設定 | 灰色虛線，`近期活動` | 否 | `isConfigured()` 為 false |
| 載入中 | 灰色虛線（更淡），`近期活動` | 否 | `venueEventCounts` 未就緒 |
| 有活動 | 粉色實線，`近期活動 N` | 是，觸發展開 | N = 活動數量 |
| 無活動 | 灰色虛線，`近期活動` | 否 | Calendar 已載入但該場館無活動 |

點擊有活動的 chip = 等同點擊整張卡片（觸發 `toggleVenue`），不另設獨立狀態。

### 活動清單

- 無上限筆數（顯示 `getUpcomingVenueEvents` 回傳的全部結果）
- 預設查詢範圍：90 天
- 每筆顯示：日期（`M/D 週X`）+ 活動標題 + 外連圖示（開 Google Calendar）
- 全天活動只顯示日期；有時間的活動顯示 `M/D 週X HH:mm`
- 活動清單第一次展開時 lazy 載入（但 raw events 已 preload，無額外 API 請求）

---

## 資料流

```
Tab 開啟
  │
  ├─ venueService.getAll()          → this.venues（立即 render，chip 全 disabled）
  │
  └─ .then(venues =>
       calendarService
         .preloadForVenues(venues)  → this.venueEventCounts（Map<venueId, number>）
         .catch(() => new Map())    → calendar 失敗時靜默降級
     )
```

兩個 Promise 不用 `Promise.all`，venues UI 先出現，calendar counts 後更新。

```
卡片展開（第一次）
  │
  └─ calendarService
       .getUpcomingVenueEvents(venue)   → this.venueEvents.set(venue.id, events)
       （raw events 已 preload，無額外 API 請求）
```

---

## GoogleCalendarService 改動

### 新增 raw events 共享 cache

```typescript
private rawCache = new Map<number, Promise<GoogleCalendarEventResource[]>>();
```

`fetchUpcomingEvents(daysAhead)` 改用此 cache：若 key 存在直接回傳，否則 fetch 並存入。

### 新增 preloadForVenues

```typescript
preloadForVenues(venues: Venue[], daysAhead = 90): Promise<Map<string, number>>
```

- 呼叫 `fetchUpcomingEvents(daysAhead)`（共享 cache，只打一次 API）
- 對每個 venue 跑 `matchesVenue`，統計 count
- 回傳 `Map<venue.id, count>`

### 修改 getUpcomingVenueEvents

- 改用 raw events shared cache（不重複 fetch）
- 移除內部的 `.slice(0, maxVenueEvents)`，回傳全部符合的活動
- `maxVenueEvents` 參數保留但忽略（向後相容），或直接從 signature 移除

### maxResults 說明

Calendar API 的 `maxResults: '100'` 短期維持。90 天活動若超過 100 筆時 badge 數可能少算，屆時再加 pagination。

---

## HomeComponent 改動

### 新增 properties

```typescript
venueEventCounts = new Map<string, number>();   // venue.id → count
calendarLoaded = false;
venueEvents = new Map<string, VenueCalendarEvent[]>();  // 展開時 lazy 填入
```

### 載入邏輯（setTab venues case）

```typescript
this.venues = await this.venueService.getAll();
this.venuesLoaded = true;
this.venuesLoading = false;

// calendar 非同步接上，不阻塞 UI
if (this.calendarService.isConfigured()) {
  this.calendarService
    .preloadForVenues(this.venues)
    .catch(() => new Map<string, number>())
    .then(counts => {
      this.venueEventCounts = counts;
      this.calendarLoaded = true;
    });
}
```

### toggleVenue 展開時 lazy 載入活動

```typescript
toggleVenue(id: string) {
  if (this.expandedVenueIds.has(id)) {
    this.expandedVenueIds.delete(id);
  } else {
    this.expandedVenueIds.add(id);
    if (!this.venueEvents.has(id)) {
      const venue = this.venues.find(v => v.id === id)!;
      this.calendarService
        .getUpcomingVenueEvents(venue)
        .then(events => this.venueEvents.set(id, events))
        .catch(() => this.venueEvents.set(id, []));
    }
  }
}
```

---

## Template 改動

### Chip

```html
@if (calendarLoaded && (venueEventCounts.get(venue.id) ?? 0) > 0) {
  <span class="chip chip-active" (click)="toggleVenue(venue.id); $event.stopPropagation()">
    近期活動 {{ venueEventCounts.get(venue.id) }}
  </span>
} @else {
  <span class="chip chip-disabled">近期活動</span>
}
```

### 展開區塊（地圖後接活動清單）

```html
@if (venueEvents.get(venue.id)?.length) {
  <div class="events-section">
    <div class="events-label">近期活動</div>
    @for (event of venueEvents.get(venue.id); track event.id) {
      <div class="event-row">
        <span class="event-date">{{ formatEventDate(event) }}</span>
        <span class="event-title">{{ event.title }}</span>
        @if (event.url) {
          <a [href]="event.url" target="_blank" rel="noopener noreferrer"
             (click)="$event.stopPropagation()" class="event-link"
             [attr.aria-label]="event.title + ' Google Calendar 連結'">
            <!-- 外連 icon -->
          </a>
        }
      </div>
    }
  </div>
}
```

### formatEventDate helper

```typescript
formatEventDate(event: VenueCalendarEvent): string {
  const date = new Date(event.start);
  const weekdays = ['週日','週一','週二','週三','週四','週五','週六'];
  const md = `${date.getMonth() + 1}/${date.getDate()} ${weekdays[date.getDay()]}`;
  if (event.isAllDay) return md;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${md} ${hh}:${mm}`;
}
```

---

## 不在範圍內

- 活動筆數分頁（`maxResults > 100` 的 pagination）
- 活動篩選（只顯示有活動的場館）
- 場館詳細頁（獨立路由）
- 活動詳細資訊（標題 + 日期 + 外連已足夠）
