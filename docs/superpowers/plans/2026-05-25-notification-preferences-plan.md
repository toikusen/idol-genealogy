# Notification Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose which push notification types they receive (per-user global toggles) instead of the current all-or-nothing model.

**Architecture:** A new `push_notification_prefs` DB table stores 5 boolean flags per user (all default `true`). Each Edge Function checks that table before sending and skips opted-out users (fail-open). The Angular `push-settings` component gets a new `NotificationPrefsService` and 5 toggle rows with inline SVG icons.

**Tech Stack:** Angular 17+ (signals, standalone components), Supabase (Postgres + RLS + Edge Functions / Deno), Jasmine/Karma

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/059_add_push_notification_prefs.sql` | Table DDL + RLS |
| Modify | `src/app/models/index.ts` | Add `NotificationPrefs` interface + `DEFAULT_NOTIFICATION_PREFS` constant |
| Create | `src/app/core/notification-prefs.service.ts` | Load + save prefs via Supabase |
| Create | `src/app/core/notification-prefs.service.spec.ts` | Unit tests for service |
| Modify | `src/app/pages/my-favorites/push-settings.component.ts` | Inject service, add 5 toggle rows |
| Modify | `supabase/functions/notify-status-change/index.ts` | Filter opted-out users |
| Modify | `supabase/functions/notify-new-song/index.ts` | Filter opted-out users |
| Modify | `supabase/functions/notify-birthdays/index.ts` | Filter opted-out users |
| Modify | `supabase/functions/notify-group-disbanded/index.ts` | Filter opted-out users |
| Modify | `supabase/functions/sync-group-events/index.ts` | Filter opted-out users |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/059_add_push_notification_prefs.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration 059: Add push_notification_prefs table for per-type notification preferences

create table if not exists push_notification_prefs (
  user_id          uuid        not null primary key references auth.users on delete cascade,
  notify_event     boolean     not null default true,
  notify_new_song  boolean     not null default true,
  notify_status    boolean     not null default true,
  notify_birthday  boolean     not null default true,
  notify_disbanded boolean     not null default true,
  updated_at       timestamptz not null default now()
);

alter table push_notification_prefs enable row level security;

-- for all covers SELECT + INSERT + UPDATE needed by frontend upsert
create policy "users can manage own notification prefs"
  on push_notification_prefs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
supabase db push
```

Expected: migration runs without error, table appears in Supabase Studio.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/059_add_push_notification_prefs.sql
git commit -m "feat(db): add push_notification_prefs table with RLS"
```

---

## Task 2: Add Model Types

**Files:**
- Modify: `src/app/models/index.ts` (append to end of file)

- [ ] **Step 1: Append to `src/app/models/index.ts`**

```typescript
export interface NotificationPrefs {
  notify_event: boolean;
  notify_new_song: boolean;
  notify_status: boolean;
  notify_birthday: boolean;
  notify_disbanded: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notify_event: true,
  notify_new_song: true,
  notify_status: true,
  notify_birthday: true,
  notify_disbanded: true,
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/models/index.ts
git commit -m "feat(models): add NotificationPrefs interface and defaults"
```

---

## Task 3: NotificationPrefsService (TDD)

**Files:**
- Create: `src/app/core/notification-prefs.service.ts`
- Create: `src/app/core/notification-prefs.service.spec.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/app/core/notification-prefs.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { NotificationPrefsService } from './notification-prefs.service';
import { SupabaseService } from './supabase.service';
import { DEFAULT_NOTIFICATION_PREFS } from '../models';

function makeDb(rowData: any = null, upsertError: any = null) {
  const maybeSingle = jasmine.createSpy('maybeSingle').and.returnValue(
    Promise.resolve({ data: rowData, error: null })
  );
  const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle });
  const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });

  const upsert = jasmine.createSpy('upsert').and.returnValue(
    Promise.resolve({ error: upsertError })
  );

  const fromSpy = jasmine.createSpy('from').and.callFake((_table: string) => ({
    select: selectSpy,
    upsert,
  }));

  return { from: fromSpy, upsert };
}

describe('NotificationPrefsService', () => {
  let service: NotificationPrefsService;
  let mockDb: ReturnType<typeof makeDb>;

  function setup(rowData: any = null) {
    mockDb = makeDb(rowData);
    TestBed.configureTestingModule({
      providers: [
        NotificationPrefsService,
        {
          provide: SupabaseService,
          useValue: { client: mockDb },
        },
      ],
    });
    service = TestBed.inject(NotificationPrefsService);
  }

  it('prefs() returns all-true defaults before loading', () => {
    setup();
    expect(service.prefs()).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('load() with no existing row keeps all-true defaults', async () => {
    setup(null); // no row
    await service.load('u-1');
    expect(service.prefs()).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('load() with existing row applies saved values', async () => {
    setup({
      notify_event: true,
      notify_new_song: false,
      notify_status: false,
      notify_birthday: true,
      notify_disbanded: true,
    });
    await service.load('u-1');
    expect(service.prefs().notify_new_song).toBeFalse();
    expect(service.prefs().notify_status).toBeFalse();
    expect(service.prefs().notify_event).toBeTrue();
  });

  it('load() is idempotent for the same userId', async () => {
    setup(null);
    await service.load('u-1');
    await service.load('u-1');
    expect(mockDb.from).toHaveBeenCalledTimes(1);
  });

  it('save() optimistically updates prefs signal', async () => {
    setup(null);
    await service.load('u-1');
    await service.save('notify_status', false);
    expect(service.prefs().notify_status).toBeFalse();
  });

  it('save() calls upsert with updated_at', async () => {
    setup(null);
    await service.load('u-1');
    await service.save('notify_birthday', false);
    const upsertArg = mockDb.from('push_notification_prefs').upsert.calls.mostRecent().args[0];
    expect(upsertArg.user_id).toBe('u-1');
    expect(upsertArg.notify_birthday).toBeFalse();
    expect(typeof upsertArg.updated_at).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx ng test --include="src/app/core/notification-prefs.service.spec.ts" --watch=false
```

Expected: FAILED — `NotificationPrefsService` not found.

- [ ] **Step 3: Implement `NotificationPrefsService`**

Create `src/app/core/notification-prefs.service.ts`:

```typescript
import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { NotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from '../models';

@Injectable({ providedIn: 'root' })
export class NotificationPrefsService {
  private readonly _prefs = signal<NotificationPrefs>({ ...DEFAULT_NOTIFICATION_PREFS });
  private _userId: string | null = null;
  private _loaded = false;

  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  prefs(): NotificationPrefs {
    return this._prefs();
  }

  async load(userId: string): Promise<void> {
    if (this._loaded && this._userId === userId) return;
    this._userId = userId;
    const { data } = await this.db
      .from('push_notification_prefs')
      .select('notify_event,notify_new_song,notify_status,notify_birthday,notify_disbanded')
      .eq('user_id', userId)
      .maybeSingle();
    this._prefs.set(data ?? { ...DEFAULT_NOTIFICATION_PREFS });
    this._loaded = true;
  }

  async save(key: keyof NotificationPrefs, value: boolean): Promise<void> {
    if (!this._userId) return;
    const updated: NotificationPrefs = { ...this._prefs(), [key]: value };
    this._prefs.set(updated);
    await this.db.from('push_notification_prefs').upsert(
      { user_id: this._userId, ...updated, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }

  reset(): void {
    this._prefs.set({ ...DEFAULT_NOTIFICATION_PREFS });
    this._userId = null;
    this._loaded = false;
  }
}
```

- [ ] **Step 4: Run test to confirm passing**

```bash
npx ng test --include="src/app/core/notification-prefs.service.spec.ts" --watch=false
```

Expected: 6 specs, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/notification-prefs.service.ts src/app/core/notification-prefs.service.spec.ts
git commit -m "feat(core): add NotificationPrefsService with load/save"
```

---

## Task 4: Update push-settings Component

**Files:**
- Modify: `src/app/pages/my-favorites/push-settings.component.ts`

- [ ] **Step 1: Replace the full component**

Overwrite `src/app/pages/my-favorites/push-settings.component.ts` with:

```typescript
import { Component, OnInit, signal, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PushNotificationService } from '../../core/push-notification.service';
import { NotificationPrefsService } from '../../core/notification-prefs.service';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationPrefs } from '../../models';

@Component({
  selector: 'app-push-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:20px;max-width:480px;">
      <div style="font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);margin-bottom:16px;">推播通知設定</div>

      @if (!pushService.isSupported()) {
        <div style="padding:16px;background:rgba(253,224,71,0.1);border:1px solid rgba(253,224,71,0.5);border-radius:12px;font-size:0.85rem;color:var(--text-primary);line-height:1.6;">
          ⚠️ 你的環境不支援推播通知。<br>
          iOS 用戶請先<strong>「加入主畫面」</strong>後開啟（需 iOS 16.4+）。
        </div>
      } @else {
        <!-- Permission row -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border-default);border-radius:16px;margin-bottom:10px;">
          <div>
            <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">推播通知</div>
            <div style="font-size:0.78rem;color:var(--text-faint-55);margin-top:3px;">{{ permissionLabel() }}</div>
          </div>
          @if (permission() === 'granted') {
            <button (click)="unsubscribe()" [disabled]="loading()"
              style="font-size:0.8rem;padding:6px 14px;border-radius:10px;border:1px solid rgba(232,121,160,0.3);background:transparent;cursor:pointer;color:var(--text-faint-75);font-family:var(--font-sans);">
              {{ loading() ? '處理中…' : '取消訂閱' }}
            </button>
          } @else {
            <button (click)="subscribe()" [disabled]="loading()"
              style="font-size:0.8rem;padding:6px 14px;border-radius:10px;border:none;background:rgba(232,121,160,1);color:white;cursor:pointer;font-family:var(--font-sans);font-weight:600;">
              {{ loading() ? '處理中…' : '開啟通知' }}
            </button>
          }
        </div>

        @if (error()) {
          <div style="margin-bottom:10px;font-size:0.78rem;color:rgba(192,80,128,0.8);">{{ error() }}</div>
        }

        <!-- Notification type preferences -->
        <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:16px;padding:4px 18px 16px;">
          <div style="font-size:0.68rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-faint-40);padding-top:14px;margin-bottom:4px;">選擇要接收的通知類型</div>

          <!-- 活動通知 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.10);">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">活動通知</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">演唱會、見面會等新活動</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_event"
                (change)="toggle('notify_event', $event)"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_event ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_event ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          <!-- 新增歌曲 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.10);">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">新增歌曲</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">發布新歌或 MV</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_new_song"
                (change)="toggle('notify_new_song', $event)"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_new_song ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_new_song ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          <!-- 狀態異動 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.10);">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">狀態異動</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">畢業、退出、休息、復歸</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_status"
                (change)="toggle('notify_status', $event)"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_status ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_status ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          <!-- 生日提醒 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.10);">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">生日提醒</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">最愛成員的生日當天</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_birthday"
                (change)="toggle('notify_birthday', $event)"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_birthday ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_birthday ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          <!-- 解散公告 -->
          <div [style.opacity]="permission() !== 'granted' ? '0.45' : '1'"
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
            <div style="display:flex;align-items:center;gap:12px;flex:1;">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-secondary);opacity:0.7;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="9" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 5-5h2"/><circle cx="17" cy="7" r="3"/><path d="M13 21v-2a5 5 0 0 1 5-5h0"/><line x1="5" y1="19" x2="21" y2="5"/>
                </svg>
              </div>
              <div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">解散公告</div>
                <div style="font-size:0.74rem;color:var(--text-faint-55);">最愛的團體發布解散消息</div>
              </div>
            </div>
            <label style="position:relative;width:44px;height:26px;flex-shrink:0;margin-left:14px;display:inline-block;">
              <input type="checkbox" [checked]="prefsService.prefs().notify_disbanded"
                (change)="toggle('notify_disbanded', $event)"
                style="opacity:0;width:0;height:0;position:absolute;">
              <span [style.background]="prefsService.prefs().notify_disbanded ? 'rgba(232,121,160,1)' : 'rgba(122,90,122,0.15)'"
                style="position:absolute;inset:0;border-radius:13px;transition:background 0.25s;cursor:pointer;">
                <span [style.transform]="prefsService.prefs().notify_disbanded ? 'translateX(18px)' : 'translateX(0)'"
                  style="position:absolute;width:20px;height:20px;border-radius:50%;background:white;top:3px;left:3px;transition:transform 0.25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,0.15);display:block;"></span>
              </span>
            </label>
          </div>

          @if (permission() !== 'granted') {
            <div style="margin-top:12px;font-size:0.74px;color:var(--text-faint-40);display:flex;align-items:flex-start;gap:6px;line-height:1.55;font-size:0.74rem;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--text-faint-40)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              開啟推播通知後，以上設定才會生效。
            </div>
          }
        </div>
      }

      <!-- iOS tip -->
      <div style="margin-top:12px;padding:14px 16px;background:rgba(147,197,253,0.08);border:1px solid rgba(147,197,253,0.25);border-radius:10px;font-size:0.82rem;color:var(--text-faint-75);line-height:1.7;">
        📱 <strong>iOS 推播說明</strong>：需使用 Safari 開啟，並「加入主畫面」後才能啟用推播（iOS 16.4+）。
      </div>
    </div>
  `,
})
export class PushSettingsComponent implements OnInit {
  readonly pushService = inject(PushNotificationService);
  readonly prefsService = inject(NotificationPrefsService);
  private supabase = inject(SupabaseService);
  private platformId = inject(PLATFORM_ID);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly _permission = signal<NotificationPermission | 'default'>('default');

  async ngOnInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      this._permission.set(Notification.permission);
    }
    const session = await this.supabase.getSessionOnce();
    if (session) {
      await this.prefsService.load(session.user.id);
    }
  }

  permission(): NotificationPermission | 'default' {
    return this._permission();
  }

  permissionLabel(): string {
    const p = this.permission();
    return p === 'granted' ? '已開啟' : p === 'denied' ? '已封鎖（請至瀏覽器設定開啟）' : '尚未開啟';
  }

  async toggle(key: keyof NotificationPrefs, event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    await this.prefsService.save(key, checked);
  }

  async subscribe(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.pushService.subscribe();
      if (isPlatformBrowser(this.platformId)) {
        this._permission.set(Notification.permission);
      }
    } catch (e: any) {
      this.error.set(e?.message ?? '訂閱失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  async unsubscribe(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.pushService.unsubscribe();
      if (isPlatformBrowser(this.platformId)) {
        this._permission.set(Notification.permission);
      }
    } catch (e: any) {
      this.error.set(e?.message ?? '取消失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/my-favorites/push-settings.component.ts
git commit -m "feat(favorites): add notification preference toggles to push-settings"
```

---

## Task 5: Edge Function — notify-status-change

**Files:**
- Modify: `supabase/functions/notify-status-change/index.ts`

The pattern: after building `userIds` from `user_favorites`, query `push_notification_prefs` to exclude opted-out users, then pass `filteredIds` to `send-push-notification`.

- [ ] **Step 1: Add preference filter**

In `supabase/functions/notify-status-change/index.ts`, replace:

```typescript
  const userIds = (favUsers ?? []).map((f: any) => f.user_id);
  if (userIds.length === 0) return new Response("no subscribers", { status: 200 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({
      user_ids: userIds,
```

with:

```typescript
  const userIds = (favUsers ?? []).map((f: any) => f.user_id);
  if (userIds.length === 0) return new Response("no subscribers", { status: 200 });

  const { data: optedOutRows, error: prefsError } = await supabase
    .from("push_notification_prefs")
    .select("user_id")
    .in("user_id", userIds)
    .eq("notify_status", false);
  const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
  const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
  if (filteredIds.length === 0) return new Response("all opted out", { status: 200 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({
      user_ids: filteredIds,
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/notify-status-change/index.ts
git commit -m "feat(functions): filter opted-out users in notify-status-change"
```

---

## Task 6: Edge Function — notify-new-song

**Files:**
- Modify: `supabase/functions/notify-new-song/index.ts`

- [ ] **Step 1: Add preference filter**

Replace:

```typescript
  const userIds = (favUsers ?? []).map((f: any) => f.user_id);
  if (userIds.length === 0) return new Response("no subscribers", { status: 200 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({
      user_ids: userIds,
```

with:

```typescript
  const userIds = (favUsers ?? []).map((f: any) => f.user_id);
  if (userIds.length === 0) return new Response("no subscribers", { status: 200 });

  const { data: optedOutRows, error: prefsError } = await supabase
    .from("push_notification_prefs")
    .select("user_id")
    .in("user_id", userIds)
    .eq("notify_new_song", false);
  const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
  const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
  if (filteredIds.length === 0) return new Response("all opted out", { status: 200 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({
      user_ids: filteredIds,
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/notify-new-song/index.ts
git commit -m "feat(functions): filter opted-out users in notify-new-song"
```

---

## Task 7: Edge Function — notify-birthdays

**Files:**
- Modify: `supabase/functions/notify-birthdays/index.ts`

This function loops over multiple members; filter inside `Promise.all`.

- [ ] **Step 1: Add preference filter inside the per-member loop**

In the `Promise.all(members.map(async (member) => {` block, replace:

```typescript
    const userIds = (favUsers ?? []).map((f: any) => f.user_id);
    if (userIds.length === 0) return;

    await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        user_ids: userIds,
```

with:

```typescript
    const userIds = (favUsers ?? []).map((f: any) => f.user_id);
    if (userIds.length === 0) return;

    const { data: optedOutRows, error: prefsError } = await supabase
      .from("push_notification_prefs")
      .select("user_id")
      .in("user_id", userIds)
      .eq("notify_birthday", false);
    const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
    const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
    if (filteredIds.length === 0) return;

    await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        user_ids: filteredIds,
```

Also update the log line that references `userIds.length` to use `filteredIds.length`:

```typescript
    // before:
    console.log(`[notify-birthdays] ${member.name} — notified ${userIds.length} user(s)`);
    // after:
    console.log(`[notify-birthdays] ${member.name} — notified ${filteredIds.length} user(s)`);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/notify-birthdays/index.ts
git commit -m "feat(functions): filter opted-out users in notify-birthdays"
```

---

## Task 8: Edge Function — notify-group-disbanded

**Files:**
- Modify: `supabase/functions/notify-group-disbanded/index.ts`

- [ ] **Step 1: Add preference filter**

Replace:

```typescript
  const userIds = (favUsers ?? []).map((f: any) => f.user_id);
  if (userIds.length === 0) return new Response("no subscribers", { status: 200 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      user_ids: userIds,
```

with:

```typescript
  const userIds = (favUsers ?? []).map((f: any) => f.user_id);
  if (userIds.length === 0) return new Response("no subscribers", { status: 200 });

  const { data: optedOutRows, error: prefsError } = await supabase
    .from("push_notification_prefs")
    .select("user_id")
    .in("user_id", userIds)
    .eq("notify_disbanded", false);
  const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
  const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
  if (filteredIds.length === 0) return new Response("all opted out", { status: 200 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      user_ids: filteredIds,
```

Also update the log line:

```typescript
  // before:
  console.log(`[notify-group-disbanded] ${groupName} — notified ${userIds.length} user(s)`);
  // after:
  console.log(`[notify-group-disbanded] ${groupName} — notified ${filteredIds.length} user(s)`);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/notify-group-disbanded/index.ts
git commit -m "feat(functions): filter opted-out users in notify-group-disbanded"
```

---

## Task 9: Edge Function — sync-group-events

**Files:**
- Modify: `supabase/functions/sync-group-events/index.ts`

This function batches events by group. The filter needs to be applied per-group before the send call.

- [ ] **Step 1: Locate the push notification block**

The send block is around line 232. Find the section where `user_ids` is assembled for each group (inside the `byGroup` loop) and apply the filter.

Find this pattern:
```typescript
      await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
```

Just before this `fetch`, the code has built `userIds` (or equivalent) for the group's subscribers. Add the preference filter there:

```typescript
      // Add after userIds is built, before the fetch:
      const { data: optedOutRows, error: prefsError } = await supabase
        .from("push_notification_prefs")
        .select("user_id")
        .in("user_id", userIds)
        .eq("notify_event", false);
      const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
      const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
      if (filteredIds.length === 0) continue;

      // Replace user_ids: userIds → user_ids: filteredIds in the fetch body
```

> Note: Read the actual file before editing — the variable name for subscriber IDs may differ from `userIds`. Match whatever name is used in the existing code.

- [ ] **Step 2: Verify TypeScript compiles (Deno check)**

```bash
deno check supabase/functions/sync-group-events/index.ts
```

Expected: no errors. (Skip if Deno is not installed locally — verify during deploy.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-group-events/index.ts
git commit -m "feat(functions): filter opted-out users in sync-group-events"
```

---

## Task 10: Deploy Edge Functions

- [ ] **Step 1: Deploy all 5 updated functions**

```bash
supabase functions deploy notify-status-change
supabase functions deploy notify-new-song
supabase functions deploy notify-birthdays
supabase functions deploy notify-group-disbanded
supabase functions deploy sync-group-events
```

Expected: each deploy returns `Deployed: <function-name>`.

- [ ] **Step 2: Smoke test via Supabase Studio**

In the Supabase dashboard → Table Editor → `push_notification_prefs`:
- Insert a row for your test user with `notify_status: false`
- Trigger a status change for a member you've favorited
- Verify you do NOT receive a push notification

- [ ] **Step 3: Final commit (if any leftover changes)**

```bash
git status
# If clean, nothing to do.
```
