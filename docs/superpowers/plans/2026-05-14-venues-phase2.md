# Venues Phase 2: Calendar Event Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在場館卡片加上近期活動 badge（preload 一次 Google Calendar，所有場館 client-side match），讓有活動的 chip 顯示數量並可點擊。

**Architecture:** `GoogleCalendarService` 加 rawCache（`daysAhead → raw events` 共享），新增 `preloadForVenues` 回傳 count map；`HomeComponent` venues tab 開啟後非同步 preload，count map 更新後 template chip 自動切換 active/disabled 狀態。

**Tech Stack:** Angular 17+ standalone, Google Calendar API v3, Jasmine/Karma

---

## File Map

| 動作 | 路徑 | 說明 |
|------|------|------|
| Modify | `src/app/core/google-calendar.service.ts` | 加 rawCache、`preloadForVenues`、移除 slice |
| Modify | `src/app/core/google-calendar.service.spec.ts` | 加 preload 相關測試 |
| Modify | `src/app/pages/home/home.component.ts` | 加 `venueEventCounts`、`calendarLoaded`、preload 呼叫 |
| Modify | `src/app/pages/home/home.component.html` | 加 chip 在卡片 header buttons 區域 |

---

## Task 1: GoogleCalendarService — rawCache + preloadForVenues + remove slice

**Files:**
- Modify: `src/app/core/google-calendar.service.ts`
- Modify: `src/app/core/google-calendar.service.spec.ts`

### 背景

目前 `getUpcomingVenueEvents(venue)` 每次都直接呼叫 `fetchUpcomingEvents(daysAhead)`，45 個場館同時查會打 45 次 API。
另外 `.slice(0, maxVenueEvents)` 預設限制 4 筆，需移除。

- [ ] **Step 1: 新增測試（先寫 failing tests）**

在 `src/app/core/google-calendar.service.spec.ts`，在 `describe('GoogleCalendarService', ...)` 的最後一個 `it(...)` 後面加入：

```typescript
describe('preloadForVenues', () => {
  const moondog: Venue = {
    id: 'venue-moondog',
    name: 'MOONDOG',
    address: '105臺北市松山區復興南路一段39號9F',
    type: 'Live House',
    region: 'north',
    google_maps_url: null,
    phone: null,
    notes: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const rawEvents = [
    {
      id: 'e1',
      summary: '杰克音樂演唱會',
      location: '杰克音樂 Jack\'s Studio',
      start: { dateTime: '2026-06-01T19:00:00+08:00' },
      status: 'confirmed',
    },
    {
      id: 'e2',
      summary: 'MOONDOG NIGHT',
      location: 'MOONDOG',
      start: { dateTime: '2026-06-02T19:00:00+08:00' },
      status: 'confirmed',
    },
    {
      id: 'e3',
      summary: '杰克第二場',
      location: '杰克音樂',
      start: { dateTime: '2026-06-08T19:00:00+08:00' },
      status: 'confirmed',
    },
  ];

  beforeEach(() => {
    spyOn(service as any, 'fetchUpcomingEvents').and.returnValue(Promise.resolve(rawEvents));
  });

  it('returns count map keyed by venue id', async () => {
    const counts = await service.preloadForVenues([baseVenue, moondog]);
    expect(counts.get('venue-1')).toBe(2);
    expect(counts.get('venue-moondog')).toBe(1);
  });

  it('calls fetchUpcomingEvents only once for multiple venues', async () => {
    const fetchSpy = (service as any).fetchUpcomingEvents as jasmine.Spy;
    await service.preloadForVenues([baseVenue, moondog]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('getUpcomingVenueEvents does not re-fetch after preloadForVenues', async () => {
    const fetchSpy = (service as any).fetchUpcomingEvents as jasmine.Spy;
    await service.preloadForVenues([baseVenue]);
    // clear per-venue cache so getUpcomingVenueEvents cannot short-circuit via its own cache
    (service as any).cache.clear();
    await service.getUpcomingVenueEvents(baseVenue);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1, rawCache reused
  });

  it('returns all matching events without a 4-item cap', async () => {
    const manyEvents = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      summary: `杰克 Event ${i}`,
      location: '杰克音樂 Jack\'s Studio',
      start: { dateTime: `2026-06-${(i + 1).toString().padStart(2, '0')}T19:00:00+08:00` },
      status: 'confirmed',
    }));
    (service as any).fetchUpcomingEvents.and.returnValue(Promise.resolve(manyEvents));
    const events = await service.getUpcomingVenueEvents(baseVenue);
    expect(events.length).toBe(6);
  });
});
```

- [ ] **Step 2: 執行測試，確認 FAIL**

```bash
cd /Users/seitumbp2025/idol-genealogy
npx ng test --include='src/app/core/google-calendar.service.spec.ts' --watch=false --browsers=ChromeHeadless
```

Expected: `preloadForVenues is not a function` 類型錯誤，4 個新測試失敗。

- [ ] **Step 3: 修改 GoogleCalendarService**

開啟 `src/app/core/google-calendar.service.ts`。

**3a. 在 `private readonly cache` 那行後面加入 rawCache：**

```typescript
private readonly rawCache = new Map<number, Promise<GoogleCalendarEventResource[]>>();
```

**3b. 將 `fetchUpcomingEvents` 改為使用 rawCache（整個方法替換）：**

找到：
```typescript
private async fetchUpcomingEvents(daysAhead: number): Promise<GoogleCalendarEventResource[]> {
```

把整個方法換成：
```typescript
private fetchUpcomingEvents(daysAhead: number): Promise<GoogleCalendarEventResource[]> {
  const cached = this.rawCache.get(daysAhead);
  if (cached) return cached;
  const timeMin = new Date();
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + daysAhead);
  const params = new URLSearchParams({
    key: this.apiKey,
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: '100',
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`;
  const promise = fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`Google Calendar API failed: ${response.status}`);
      return response.json() as Promise<GoogleCalendarEventsResponse>;
    })
    .then(data => (data.items ?? []).filter(event => event.status !== 'cancelled' && !!event.start));
  this.rawCache.set(daysAhead, promise);
  return promise;
}
```

**3c. 在 `getUpcomingVenueEvents` 方法中移除 `.slice(0, maxVenueEvents)`：**

找到：
```typescript
const promise = this.fetchUpcomingEvents(daysAhead)
  .then(events => events
    .filter(event => this.matchesVenue(event, venue))
    .slice(0, maxVenueEvents)
    .map(event => this.toVenueEvent(event)));
```

改成：
```typescript
const promise = this.fetchUpcomingEvents(daysAhead)
  .then(events => events
    .filter(event => this.matchesVenue(event, venue))
    .map(event => this.toVenueEvent(event)));
```

**3d. 在 `isConfigured()` 方法後面加入 `preloadForVenues`：**

```typescript
async preloadForVenues(venues: Venue[], daysAhead = 90): Promise<Map<string, number>> {
  if (!this.isConfigured()) return new Map();
  const rawEvents = await this.fetchUpcomingEvents(daysAhead);
  const counts = new Map<string, number>();
  for (const venue of venues) {
    const count = rawEvents.filter(event => this.matchesVenue(event, venue)).length;
    if (count > 0) counts.set(venue.id, count);
  }
  return counts;
}
```

- [ ] **Step 4: 執行測試，確認全部 PASS**

```bash
npx ng test --include='src/app/core/google-calendar.service.spec.ts' --watch=false --browsers=ChromeHeadless
```

Expected: 全部 pass（原有 12 個 + 新增 4 個 = 16 specs，0 failures）。

- [ ] **Step 5: Commit**

```bash
git add src/app/core/google-calendar.service.ts src/app/core/google-calendar.service.spec.ts
git commit -m "feat(venues): add rawCache and preloadForVenues to GoogleCalendarService, remove event count limit"
```

---

## Task 2: HomeComponent — venueEventCounts + calendarLoaded + preload 觸發

**Files:**
- Modify: `src/app/pages/home/home.component.ts`

### 背景

`setTab('venues')` 目前只 `await venueService.getAll()`，不觸發 Calendar preload。
需要加兩個 properties 並在 venues 載完後非同步跑 `preloadForVenues`。

- [ ] **Step 1: 加入兩個 properties**

在 `src/app/pages/home/home.component.ts`，找到：
```typescript
expandedVenueIds = new Set<string>();
```

在其後加入：
```typescript
venueEventCounts = new Map<string, number>();
calendarLoaded = false;
```

- [ ] **Step 2: 修改 setTab venues case，觸發 preload**

找到：
```typescript
if (tab === 'venues' && !this.venuesLoaded) {
  this.venuesLoading = true;
  try {
    this.venues = await this.venueService.getAll();
    this.venuesLoaded = true;
    this.venuesNorth = this.venues.filter(v => v.region === 'north');
    this.venuesCentral = this.venues.filter(v => v.region === 'central');
    this.venuesSouth = this.venues.filter(v => v.region === 'south');
  } finally {
    this.venuesLoading = false;
  }
}
```

整段換成：
```typescript
if (tab === 'venues' && !this.venuesLoaded) {
  this.venuesLoading = true;
  try {
    this.venues = await this.venueService.getAll();
    this.venuesLoaded = true;
    this.venuesNorth = this.venues.filter(v => v.region === 'north');
    this.venuesCentral = this.venues.filter(v => v.region === 'central');
    this.venuesSouth = this.venues.filter(v => v.region === 'south');
    // Calendar preload: non-blocking, badge updates when ready
    this.googleCalendarService
      .preloadForVenues(this.venues)
      .then(counts => {
        if (!this.destroyed) {
          this.venueEventCounts = counts;
          this.calendarLoaded = true;
        }
      })
      .catch(() => {
        if (!this.destroyed) this.calendarLoaded = true;
      });
  } finally {
    this.venuesLoading = false;
  }
}
```

- [ ] **Step 3: TypeScript build 確認無錯誤**

```bash
npx ng build --configuration=development 2>&1 | grep -E "error|Error" | head -20
```

Expected: 無 error 輸出。

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/home/home.component.ts
git commit -m "feat(venues): add venueEventCounts preload to home component"
```

---

## Task 3: Template — Chip count badge

**Files:**
- Modify: `src/app/pages/home/home.component.html`

### 背景

目前 `#venueCard` template 的 buttons 區域只有複製按鈕和 chevron，沒有近期活動 chip。
需加在複製按鈕左側。

- [ ] **Step 1: 在 buttons 區域加入 chip**

在 `src/app/pages/home/home.component.html`，找到 `<!-- Buttons -->` 那一整段：

```html
          <!-- Buttons -->
          <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
            <button
              (click)="copyAddress(venue.address, $event)"
```

在 `<div style="display:flex;...">` 和 `<button (click)="copyAddress...">` 之間，插入 chip：

```html
            @if (calendarLoaded && (venueEventCounts.get(venue.id) ?? 0) > 0) {
              <span
                (click)="toggleVenue(venue); $event.stopPropagation()"
                style="font-size:0.6rem;padding:4px 9px;border-radius:20px;border:1px solid rgba(232,121,160,0.55);color:#c9527a;background:rgba(232,121,160,0.08);font-weight:500;letter-spacing:0.04em;white-space:nowrap;cursor:pointer;"
                [attr.aria-label]="'查看 ' + venue.name + ' 近期活動'"
              >
                近期活動 {{ venueEventCounts.get(venue.id) }}
              </span>
            } @else {
              <span style="font-size:0.6rem;padding:4px 9px;border-radius:20px;border:1px dashed rgba(232,121,160,0.28);color:rgba(232,121,160,0.45);background:rgba(232,121,160,0.04);letter-spacing:0.04em;white-space:nowrap;cursor:not-allowed;">
                近期活動
              </span>
            }
```

- [ ] **Step 2: 啟動 dev server 手動驗證**

```bash
npx ng serve
```

開啟 `http://localhost:4200`，點「場地」Tab，確認：
1. 頁面出現後所有 chip 顯示灰色虛線「近期活動」（Calendar preload 中）
2. 數秒後有活動的場館 chip 變成粉色實線並顯示數量（例如「近期活動 3」）
3. 點擊有活動的 chip → 卡片展開，活動清單出現在地圖下方
4. 展開無活動的卡片 → 只顯示地圖，不出現活動清單
5. 無活動的 chip 維持灰色虛線，無法點擊

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/home/home.component.html
git commit -m "feat(venues): add event count chip to venue card header"
```

---

## Self-Review Checklist

- [x] rawCache keyed by `daysAhead` (Map<number, Promise>) — Task 1 Step 3a
- [x] `preloadForVenues` 呼叫一次 `fetchUpcomingEvents`，所有 venue client-side match — Task 1 Step 3d
- [x] `getUpcomingVenueEvents` 移除 `.slice(0, maxVenueEvents)` — Task 1 Step 3c
- [x] `getUpcomingVenueEvents` 使用 rawCache（不重打 API）— Task 1 Step 3b
- [x] `venueEventCounts` / `calendarLoaded` properties — Task 2 Step 1
- [x] preload 非同步，不阻塞 venues UI — Task 2 Step 2（`.then()` 不 await）
- [x] preload 失敗時 `calendarLoaded = true`（chip 顯示 disabled 而非永遠 loading）— Task 2 Step 2
- [x] `destroyed` guard 防止 component 銷毀後更新 — Task 2 Step 2
- [x] Chip active 狀態（粉色，有數量，可點） — Task 3 Step 1
- [x] Chip disabled 狀態（灰色虛線，`cursor:not-allowed`）— Task 3 Step 1
- [x] 無活動卡片仍可展開（click 在 card wrapper，chip 不影響） — Task 3 Step 1
- [x] 活動清單無上限（template `@for` 無 slice）— 現有 template 已是全量
- [x] TDD：先寫 4 個 failing tests，再實作 — Task 1
