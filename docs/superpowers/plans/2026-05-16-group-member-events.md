# Group / Member Recent Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在團體頁與成員頁顯示來自 Google Calendar 的近期活動，依團體名稱比對，核心約束是絕不誤放不屬於該團體的活動。

**Architecture:** 擴充現有 `GoogleCalendarService` 加入 `getUpcomingGroupEvents` 與嚴格的 `matchesGroup` 邏輯；新增共用元件 `GroupEventsComponent`（single / merged 兩種模式）；團體頁與成員頁各自引入元件並插入正確位置。Spec: `docs/superpowers/specs/2026-05-16-group-member-events-design.md`

**Tech Stack:** Angular 17+ standalone components、TypeScript、Jasmine/Karma 單元測試

---

## File Map

| 動作 | 路徑 | 說明 |
|------|------|------|
| Modify | `src/app/core/google-calendar.service.ts` | 新增 `getUpcomingGroupEvents`、`matchesGroup`、`tokenMatch`；venue cache key 加 prefix |
| Modify | `src/app/core/google-calendar.service.spec.ts` | 新增 `matchesGroup` 測試 |
| Create | `src/app/shared/group-events/group-events.component.ts` | 共用元件（含 template） |
| Create | `src/app/shared/group-events/group-events.component.spec.ts` | 元件測試 |
| Modify | `src/app/pages/group-page/group-page.component.ts` | import `GroupEventsComponent` |
| Modify | `src/app/pages/group-page/group-page.component.html` | 插入 `<app-group-events>` |
| Modify | `src/app/pages/member-page/member-page.component.ts` | import `GroupEventsComponent`、新增 `activeGroups` getter |
| Modify | `src/app/pages/member-page/member-page.component.html` | 插入 `<app-group-events>` |

---

## Task 1: 擴充 GoogleCalendarService

**Files:**
- Modify: `src/app/core/google-calendar.service.ts`
- Modify: `src/app/core/google-calendar.service.spec.ts`

### 背景

目前 `getUpcomingVenueEvents` 的 derived cache key 是 `${venue.id}:${daysAhead}`，不帶前綴。本次新增 group cache，兩者共用同一個 `cache: Map`，所以 venue key 需加上 `venue:` prefix 避免潛在衝突。matchesGroup 的比對邏輯比 matchesVenue 更嚴格（無 description、無 CJK bigram、有長度門檻、英數用 token boundary）。

- [ ] **Step 1: 寫 matchesGroup 的失敗測試**

在 `google-calendar.service.spec.ts` 找到測試區塊（或在最末尾加），新增：

```ts
describe('matchesGroup', () => {
  let service: GoogleCalendarService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GoogleCalendarService] });
    service = TestBed.inject(GoogleCalendarService);
  });

  function mkEvent(summary: string, location = '', description = ''): any {
    return { id: 'e1', summary, location, description, status: 'confirmed', start: { dateTime: '2026-06-01T10:00:00' } };
  }

  function mkGroup(name: string, name_jp: string | null = null): any {
    return { id: 'g1', name, name_jp } as any;
  }

  it('matches group name found in summary', () => {
    expect((service as any).matchesGroup(mkEvent('乃木坂46 ライブ'), mkGroup('乃木坂46'))).toBeTrue();
  });

  it('matches name_jp in summary', () => {
    expect((service as any).matchesGroup(mkEvent('ピンクハット ライブ'), mkGroup('Pink Hat', 'ピンクハット'))).toBeTrue();
  });

  it('matches alphanumeric name in summary with token boundary', () => {
    expect((service as any).matchesGroup(mkEvent('AKB48 concert'), mkGroup('AKB48'))).toBeTrue();
  });

  it('does NOT match alphanumeric name embedded in another word', () => {
    expect((service as any).matchesGroup(mkEvent('spring concert'), mkGroup('RING'))).toBeFalse();
  });

  it('does NOT match short CJK name (< 3 chars) anywhere', () => {
    expect((service as any).matchesGroup(mkEvent('嵐 コンサート'), mkGroup('嵐'))).toBeFalse();
  });

  it('does NOT match short alpha name (< 4 chars) in summary', () => {
    expect((service as any).matchesGroup(mkEvent('AKB live'), mkGroup('AKB'))).toBeFalse();
  });

  it('does NOT match description even when name present', () => {
    expect((service as any).matchesGroup(mkEvent('live show', '', '乃木坂46 出演'), mkGroup('乃木坂46'))).toBeFalse();
  });

  it('matches CJK name in location when length >= 4', () => {
    expect((service as any).matchesGroup(mkEvent('live show', '乃木坂46'), mkGroup('乃木坂46'))).toBeTrue();
  });

  it('does NOT match CJK name in location when length < 4 (only 3 CJK chars)', () => {
    // '乃木坂' = 3 CJK, passes summary threshold but NOT location threshold
    expect((service as any).matchesGroup(mkEvent('show', '乃木坂'), mkGroup('乃木坂'))).toBeFalse();
  });

  it('does NOT match alpha name in location when length < 6', () => {
    // 'AKB48' = 5 alpha chars, passes summary (>=4) but NOT location (needs >=6)
    expect((service as any).matchesGroup(mkEvent('show', 'AKB48 venue'), mkGroup('AKB48'))).toBeFalse();
  });

  it('handles full-width alphanumeric via NFKC normalization', () => {
    expect((service as any).matchesGroup(mkEvent('ＡＫＢ４８ concert'), mkGroup('AKB48'))).toBeTrue();
  });
});
```

- [ ] **Step 2: 執行測試，確認全部 FAIL（方法不存在）**

```bash
npx ng test --include="src/app/core/google-calendar.service.spec.ts" --watch=false
```

預期：所有 `matchesGroup` 測試 FAIL，錯誤訊息為 `(service as any).matchesGroup is not a function`

- [ ] **Step 3: 實作 — 更新 venue cache key 並新增 group 方法**

在 `google-calendar.service.ts` 的 `getUpcomingVenueEvents` 方法中，將：

```ts
const cacheKey = `${venue.id}:${daysAhead}`;
```

改為：

```ts
const cacheKey = `venue:${venue.id}:${daysAhead}`;
```

然後在 `getUpcomingVenueEvents` 方法之後（`private fetchUpcomingEvents` 之前）插入：

```ts
getUpcomingGroupEvents(group: Group, daysAhead = 90): Promise<VenueCalendarEvent[]> {
  if (!this.isConfigured()) return Promise.resolve([]);
  const cacheKey = `group:${group.id}:${daysAhead}`;
  const cached = this.cache.get(cacheKey);
  if (cached) return cached;
  const rawPromise = this.rawCache.get(daysAhead) ?? this.fetchUpcomingEvents(daysAhead);
  const promise = rawPromise.then(events =>
    events
      .filter(event => this.matchesGroup(event, group))
      .map(event => this.toVenueEvent(event)),
  );
  this.cache.set(cacheKey, promise);
  return promise;
}

private matchesGroup(event: GoogleCalendarEventResource, group: Group): boolean {
  const names = [group.name, group.name_jp].filter((n): n is string => !!n);
  const summaryNfkc = (event.summary ?? '').normalize('NFKC').toLowerCase();
  const locationNfkc = (event.location ?? '').normalize('NFKC').toLowerCase();
  // CJK/Kana matching: strip non-CJK/Kana/alphanumeric
  const stripNonCjk = (s: string) =>
    s.replace(/[^ぁ-ゖァ-ー一-鿿㐀-䶿a-z0-9]/g, '');
  const summaryStripped = stripNonCjk(summaryNfkc);
  const locationStripped = stripNonCjk(locationNfkc);

  for (const name of names) {
    const nfkc = name.normalize('NFKC').toLowerCase();
    const hasCjkKana = /[ぁ-ゖァ-ー一-鿿㐀-䶿]/.test(nfkc);

    if (hasCjkKana) {
      const stripped = stripNonCjk(nfkc);
      const cjkKanaCount = (stripped.match(/[ぁ-ゖァ-ー一-鿿㐀-䶿]/g) ?? []).length;
      if (cjkKanaCount >= 3 && summaryStripped.includes(stripped)) return true;
      if (cjkKanaCount >= 4 && locationStripped.includes(stripped)) return true;
    } else {
      const stripped = stripNonCjk(nfkc); // keeps only [a-z0-9]
      const alphaCount = stripped.length;
      if (alphaCount >= 4 && this.tokenMatch(stripped, summaryNfkc)) return true;
      if (alphaCount >= 6 && this.tokenMatch(stripped, locationNfkc)) return true;
    }
  }
  return false;
}

private tokenMatch(name: string, text: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}
```

- [ ] **Step 4: 執行測試，確認全部 PASS**

```bash
npx ng test --include="src/app/core/google-calendar.service.spec.ts" --watch=false
```

預期：所有 `matchesGroup` 測試 PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/google-calendar.service.ts src/app/core/google-calendar.service.spec.ts
git commit -m "feat(calendar): add getUpcomingGroupEvents with strict matchesGroup logic"
```

---

## Task 2: 建立 GroupEventsComponent

**Files:**
- Create: `src/app/shared/group-events/group-events.component.ts`
- Create: `src/app/shared/group-events/group-events.component.spec.ts`

### 背景

元件接收 `groups: Group[]`。`groups.length === 1` 為 single mode（團體頁），`> 1` 為 merged mode（成員頁）。使用 generation counter 忽略過期 promise。`hasEvents` 決定是否顯示整個區塊。

- [ ] **Step 1: 寫元件測試**

建立 `src/app/shared/group-events/group-events.component.spec.ts`：

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { GroupEventsComponent } from './group-events.component';
import { GoogleCalendarService } from '../../core/google-calendar.service';
import { Group, VenueCalendarEvent } from '../../models';

function mockGroup(id: string, name = `Group ${id}`): Group {
  return { id, name, name_jp: null, photo_url: null, color: '#000', company: null, company_id: null,
    founded_at: null, disbanded_at: null, notes: null, is_trainee: false, style: null,
    instagram: null, facebook: null, x: null, youtube: null,
    updated_at: '2026-01-01', created_at: '2026-01-01' };
}

function mockEvent(id: string, start = '2026-06-01T10:00:00'): VenueCalendarEvent {
  return { id, title: `Event ${id}`, start, end: null, location: null, url: `https://example.com/${id}`, isAllDay: false };
}

describe('GroupEventsComponent', () => {
  let component: GroupEventsComponent;
  let fixture: ComponentFixture<GroupEventsComponent>;
  let calendarSpy: jasmine.SpyObj<GoogleCalendarService>;

  beforeEach(async () => {
    calendarSpy = jasmine.createSpyObj('GoogleCalendarService', ['getUpcomingGroupEvents']);
    await TestBed.configureTestingModule({
      imports: [GroupEventsComponent],
      providers: [{ provide: GoogleCalendarService, useValue: calendarSpy }],
    }).compileComponents();
    fixture = TestBed.createComponent(GroupEventsComponent);
    component = fixture.componentInstance;
  });

  function triggerChange(newGroups: Group[]): void {
    component.groups = newGroups;
    component.ngOnChanges({ groups: new SimpleChange(null, newGroups, true) });
  }

  it('hides section when no events returned', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    triggerChange([mockGroup('g1')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('shows events in single mode', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([mockEvent('e1')]));
    triggerChange([mockGroup('g1')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a').length).toBe(1);
  });

  it('deduplicates events across groups in merged mode', async () => {
    const shared = mockEvent('e1');
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([shared]));
    triggerChange([mockGroup('g1'), mockGroup('g2')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.mergedEvents.length).toBe(1);
    expect(component.mergedEvents[0].groupNames.length).toBe(2);
  });

  it('sorts merged events by start ascending', async () => {
    calendarSpy.getUpcomingGroupEvents.and.callFake((g: Group) =>
      g.id === 'g1'
        ? Promise.resolve([mockEvent('e2', '2026-06-10T10:00:00')])
        : Promise.resolve([mockEvent('e1', '2026-06-01T10:00:00')]),
    );
    triggerChange([mockGroup('g1'), mockGroup('g2')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.mergedEvents[0].id).toBe('e1');
    expect(component.mergedEvents[1].id).toBe('e2');
  });

  it('resets and reloads when groups input changes', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([mockEvent('e1')]));
    triggerChange([mockGroup('g1')]);
    await fixture.whenStable();

    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    component.groups = [mockGroup('g2')];
    component.ngOnChanges({ groups: new SimpleChange([mockGroup('g1')], [mockGroup('g2')], false) });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.singleEvents.length).toBe(0);
  });

  it('hides section on load failure in single mode', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.reject('error'));
    triggerChange([mockGroup('g1')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('shows partial results when one group fails in merged mode', async () => {
    calendarSpy.getUpcomingGroupEvents.and.callFake((g: Group) =>
      g.id === 'g1' ? Promise.resolve([mockEvent('e1')]) : Promise.reject('err'),
    );
    triggerChange([mockGroup('g1'), mockGroup('g2')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.mergedEvents.length).toBe(1);
  });
});
```

- [ ] **Step 2: 執行測試，確認全部 FAIL（元件不存在）**

```bash
npx ng test --include="src/app/shared/group-events/group-events.component.spec.ts" --watch=false
```

預期：編譯錯誤或 FAIL，因為 `group-events.component.ts` 尚不存在

- [ ] **Step 3: 建立 GroupEventsComponent**

建立 `src/app/shared/group-events/group-events.component.ts`：

```ts
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Group, VenueCalendarEvent } from '../../models';
import { GoogleCalendarService } from '../../core/google-calendar.service';

interface MergedEvent extends VenueCalendarEvent {
  groupNames: string[];
}

@Component({
  selector: 'app-group-events',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loading || hasEvents) {
      <section style="margin: 32px 0;">
        <div style="font-size:0.65rem;font-weight:600;color:var(--text-label,#888);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;">近期活動</div>
        @if (loading) {
          <div style="font-size:0.68rem;color:var(--text-faint,#aaa);">讀取活動中…</div>
        } @else {
          @for (event of singleEvents; track event.id) {
            <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
               style="display:grid;grid-template-columns:52px 1fr;gap:8px;padding:5px 0;text-decoration:none;border-top:1px solid rgba(0,0,0,0.06);">
              <span style="font-size:0.62rem;color:#7c6cf2;font-weight:600;">{{ formatDate(event.start) }}</span>
              <span style="font-size:0.7rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ event.title }}</span>
            </a>
          }
          @for (event of mergedEvents; track event.id) {
            <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
               style="display:grid;grid-template-columns:52px 1fr;gap:8px;padding:5px 0;text-decoration:none;border-top:1px solid rgba(0,0,0,0.06);">
              <span style="font-size:0.62rem;color:#7c6cf2;font-weight:600;">{{ formatDate(event.start) }}</span>
              <div>
                <span style="font-size:0.7rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">{{ event.title }}</span>
                <span style="font-size:0.6rem;color:var(--text-faint);">{{ event.groupNames.join(' · ') }}</span>
              </div>
            </a>
          }
        }
      </section>
    }
  `,
})
export class GroupEventsComponent implements OnChanges {
  @Input() groups: Group[] = [];

  protected loading = false;
  protected singleEvents: VenueCalendarEvent[] = [];
  protected mergedEvents: MergedEvent[] = [];

  private generation = 0;

  constructor(private calendarService: GoogleCalendarService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['groups']) void this.reload();
  }

  protected get hasEvents(): boolean {
    return this.singleEvents.length > 0 || this.mergedEvents.length > 0;
  }

  protected formatDate(start: string): string {
    try {
      const d = new Date(start);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return start.slice(5, 10).replace('-', '/');
    }
  }

  private async reload(): Promise<void> {
    const gen = ++this.generation;
    this.loading = true;
    this.singleEvents = [];
    this.mergedEvents = [];

    const results = await Promise.allSettled(
      this.groups.map(g =>
        this.calendarService.getUpcomingGroupEvents(g).then(events => ({ group: g, events })),
      ),
    );

    if (gen !== this.generation) return;

    if (this.groups.length === 1) {
      const r = results[0];
      this.singleEvents = r.status === 'fulfilled' ? r.value.events : [];
    } else {
      const eventMap = new Map<string, MergedEvent>();
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const event of r.value.events) {
          const existing = eventMap.get(event.id);
          if (existing) {
            existing.groupNames.push(r.value.group.name);
          } else {
            eventMap.set(event.id, { ...event, groupNames: [r.value.group.name] });
          }
        }
      }
      this.mergedEvents = [...eventMap.values()].sort((a, b) => a.start.localeCompare(b.start));
    }

    this.loading = false;
  }
}
```

- [ ] **Step 4: 執行測試，確認全部 PASS**

```bash
npx ng test --include="src/app/shared/group-events/group-events.component.spec.ts" --watch=false
```

預期：所有測試 PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/group-events/
git commit -m "feat(group-events): add GroupEventsComponent with single/merged display modes"
```

---

## Task 3: 整合至團體頁

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts:1-25`（imports 區）
- Modify: `src/app/pages/group-page/group-page.component.html:619-624`（tab 之前）

### 背景

在團體頁的 `<!-- ══ Tabs: members / connections ══ -->` 區塊之前（HTML line 621）插入元件。元件接收 `[groups]="[group!]"`（single mode）。需在 component class 的 `imports` 陣列加入 `GroupEventsComponent`。

- [ ] **Step 1: 在 group-page.component.ts 加入 import**

在 `src/app/pages/group-page/group-page.component.ts` 的 import 區塊加入：

```ts
import { GroupEventsComponent } from '../../shared/group-events/group-events.component';
```

並在 `@Component` 的 `imports` 陣列中加入 `GroupEventsComponent`：

```ts
imports: [
  // ...existing imports...
  GroupEventsComponent,
],
```

- [ ] **Step 2: 在 group-page.component.html 插入元件**

找到 `src/app/pages/group-page/group-page.component.html` 的以下區塊（約 line 621）：

```html
      <!-- ══ Tabs: members / connections ══ -->
      <div class="mt-10 px-4 sm:px-6">
```

在其前方插入：

```html
      <!-- ══ Recent Events ══ -->
      @if (group) {
        <div class="px-4 sm:px-6">
          <app-group-events [groups]="[group]" />
        </div>
      }

```

- [ ] **Step 3: 建置確認無錯誤**

```bash
npx ng build --configuration=development 2>&1 | tail -5
```

預期：`Build at:` 行出現，無 TypeScript 錯誤

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/group-page/group-page.component.ts src/app/pages/group-page/group-page.component.html
git commit -m "feat(group-page): integrate GroupEventsComponent below group info"
```

---

## Task 4: 整合至成員頁

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.ts`（imports 區 + activeGroups getter）
- Modify: `src/app/pages/member-page/member-page.component.html:571-574`（songs section 之後）

### 背景

`histories` 已透過 resolver 以 `select('*, group:groups(*)')` join，`h.group` 有完整 Group 物件。`activeGroups` getter 過濾 `active | concurrent | support` 並去重。成員頁插入位置：songs `</section>`（line 571）之後、attribution widget 之前。

- [ ] **Step 1: 在 member-page.component.ts 加入 import 和 getter**

在 import 區塊加入：

```ts
import { GroupEventsComponent } from '../../shared/group-events/group-events.component';
import { Group } from '../../models'; // Group 可能已 import，確認即可
```

在 `@Component` 的 `imports` 陣列加入 `GroupEventsComponent`。

在 class 內（`histories: History[] = [];` 之後）加入 getter：

```ts
get activeGroups(): Group[] {
  const statuses = new Set(['active', 'concurrent', 'support']);
  const seen = new Set<string>();
  return this.histories
    .filter(h => statuses.has(h.status ?? '') && h.group != null)
    .map(h => h.group!)
    .filter(g => !seen.has(g.id) && seen.add(g.id));
}
```

- [ ] **Step 2: 在 member-page.component.html 插入元件**

找到 `src/app/pages/member-page/member-page.component.html` 的 songs section 結尾（約 line 571）：

```html
      </section>

      <!-- Source and editorial note -->
```

在 `</section>` 與 `<!-- Source and editorial note -->` 之間插入：

```html

      <!-- ══ Recent Events ══ -->
      @if (activeGroups.length > 0) {
        <app-group-events [groups]="activeGroups" />
      }

```

- [ ] **Step 3: 建置確認無錯誤**

```bash
npx ng build --configuration=development 2>&1 | tail -5
```

預期：`Build at:` 行出現，無 TypeScript 錯誤

- [ ] **Step 4: 執行完整測試確認無回歸**

```bash
npx ng test --watch=false 2>&1 | tail -20
```

預期：所有測試 PASS（或與 Task 1/2 之前相同的現有失敗數）

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/member-page/member-page.component.ts src/app/pages/member-page/member-page.component.html
git commit -m "feat(member-page): integrate GroupEventsComponent for active groups"
```
