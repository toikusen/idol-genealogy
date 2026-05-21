# Plan 3: 活動同步 + 推播通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 `group_events` 快取表並定期從 Google Calendar / TimeTree 同步活動，讓 feed 有活動資料，並實作推播通知（活動、新歌、成員異動）。

**Architecture:** Supabase Scheduled Edge Function (cron) 定期同步活動到 `group_events`，新活動送 push；新歌和成員異動使用 Database Webhook → Edge Function；前端用 Angular `SwPush` 處理訂閱和通知點擊；通知 payload 格式採 Angular ngsw 規格（ngsw 自動顯示 OS 通知）。

**Tech Stack:** Supabase Edge Functions (Deno), `web-push` npm library, Angular `@angular/service-worker` SwPush, VAPID

**前置條件：** Plan 1（PWA + SW）和 Plan 2（favorites + push-settings）已完成

---

## File Map

| 動作 | 檔案 |
|------|------|
| Create | `supabase/migrations/056_add_group_events.sql` |
| Create | `supabase/migrations/057_add_push_subscriptions.sql` |
| Create | `supabase/migrations/058_backfill_group_events_notified.sql` |
| Create | `supabase/functions/sync-group-events/index.ts` |
| Create | `supabase/functions/send-push-notification/index.ts` |
| Create | `supabase/functions/notify-new-song/index.ts` |
| Create | `supabase/functions/notify-status-change/index.ts` |
| Create | `src/app/core/push-notification.service.ts` |
| Create | `src/app/core/push-notification.service.spec.ts` |
| Modify | `src/app/pages/my-favorites/push-settings.component.ts` |

---

### Task 1: Migration — group_events

**Files:**
- Create: `supabase/migrations/056_add_group_events.sql`

- [ ] **Step 1: 建立 migration**

`supabase/migrations/056_add_group_events.sql`：

```sql
-- Migration 056: Add group_events cache table for external calendar sync

create table if not exists group_events (
  id               uuid        not null default gen_random_uuid() primary key,
  group_id         uuid        not null references groups on delete cascade,
  source           text        not null check (source in ('google_calendar', 'timetree')),
  source_event_id  text        not null,
  title            text        not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  location         text,
  url              text,
  content_hash     text,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  notified_at      timestamptz,
  unique (source, source_event_id, group_id)
);

-- Public read (for feed), service role write (for cron Edge Function)
alter table group_events enable row level security;

create policy "public can read group_events"
  on group_events for select
  using (true);
```

- [ ] **Step 2: 套用 migration**

```bash
npx supabase db push
```

---

### Task 2: Migration — push_subscriptions

**Files:**
- Create: `supabase/migrations/057_add_push_subscriptions.sql`

- [ ] **Step 1: 建立 migration**

`supabase/migrations/057_add_push_subscriptions.sql`：

```sql
-- Migration 057: Add push_subscriptions table for Web Push API

create table if not exists push_subscriptions (
  id          uuid        not null default gen_random_uuid() primary key,
  user_id     uuid        not null references auth.users on delete cascade,
  endpoint    text        not null,
  p256dh      text        not null,
  auth_key    text        not null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "users can manage own subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: 套用 migration**

```bash
npx supabase db push
```

---

### Task 3: 產生 VAPID Key Pair

- [ ] **Step 1: 產生 VAPID 公私鑰**

```bash
node -e "
const crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
});
const b64 = buf => buf.toString('base64url');
console.log('VAPID_PUBLIC_KEY=', b64(publicKey));
console.log('VAPID_PRIVATE_KEY=', b64(privateKey));
"
```

或使用 `web-push` CLI：

```bash
npx web-push generate-vapid-keys --json
```

- [ ] **Step 2: 將私鑰和 Email 存入 Supabase secrets**

```bash
npx supabase secrets set VAPID_PUBLIC_KEY=<公鑰>
npx supabase secrets set VAPID_PRIVATE_KEY=<私鑰>
npx supabase secrets set VAPID_SUBJECT=mailto:sei.tu@neutec.com.tw
```

- [ ] **Step 3: 將公鑰加入 Angular 環境變數**

在 `src/environments/environment.ts` 和 `environment.prod.ts` 加入：

```typescript
vapidPublicKey: '<你的 VAPID 公鑰>',
```

---

### Task 4: send-push-notification Edge Function（共用工具）

**Files:**
- Create: `supabase/functions/send-push-notification/index.ts`

- [ ] **Step 1: 建立共用推播 Edge Function**

`supabase/functions/send-push-notification/index.ts`：

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  user_ids: string[];
  notification: {
    title: string;
    body: string;
    icon?: string;
    data?: { onActionClick?: { default?: { operation: string; url: string } } };
  };
}

// Minimal VAPID / Web Push implementation using Deno crypto
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth_key: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string,
): Promise<Response> {
  // Import web-push compatible library
  const webpush = await import("npm:web-push@3.6.7");
  webpush.setVapidDetails(subject, vapidPublicKey, vapidPrivateKey);
  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
    },
    payload,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

  const body = await req.json() as PushPayload;

  // Fetch subscriptions for all target users
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("user_id", body.user_ids);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({ notification: body.notification });
  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    (subs ?? []).map(async (sub) => {
      try {
        await sendWebPush(sub, payload, vapidPublicKey, vapidPrivateKey, vapidSubject);
      } catch (err: any) {
        // 410 Gone = subscription expired, clean up
        if (err?.statusCode === 410) expiredEndpoints.push(sub.endpoint);
      }
    }),
  );

  // Clean up expired endpoints
  if (expiredEndpoints.length) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints);
  }

  return new Response(
    JSON.stringify({ sent: (subs?.length ?? 0) - expiredEndpoints.length, cleaned: expiredEndpoints.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
```

---

### Task 5: sync-group-events Edge Function（cron）

**Files:**
- Create: `supabase/functions/sync-group-events/index.ts`

- [ ] **Step 1: 建立同步 Edge Function**

`supabase/functions/sync-group-events/index.ts`：

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "https://deno.land/std@0.168.0/hash/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CalendarEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string;
  location?: string;
  url?: string;
}

function contentHash(event: CalendarEvent): string {
  const str = `${event.title}|${event.starts_at}|${event.location ?? ''}`;
  return createHash("sha256").update(str).toString("hex").slice(0, 16);
}

async function fetchTimetreeEvents(timetreeUrl: string): Promise<CalendarEvent[]> {
  // Parse group's timetree_url to get calendar ID
  // timetree_url format: https://timetreeapp.com/calendars/<cal_id>
  const calId = timetreeUrl.split('/calendars/')[1];
  if (!calId) return [];

  // TimeTree public iCal export URL
  const icalUrl = `https://timetreeapp.com/calendars/${calId}/public_icals/timetree.ics`;
  try {
    const res = await fetch(icalUrl);
    if (!res.ok) return [];
    const ical = await res.text();
    return parseIcal(ical);
  } catch {
    return [];
  }
}

function parseIcal(ical: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const blocks = ical.split('BEGIN:VEVENT');
  for (const block of blocks.slice(1)) {
    const get = (key: string) => {
      const match = block.match(new RegExp(`${key}[^:]*:(.+)`));
      return match ? match[1].trim().replace(/\\n/g, '\n').replace(/\\,/g, ',') : undefined;
    };
    const uid = get('UID');
    const summary = get('SUMMARY');
    const dtstart = get('DTSTART');
    const dtend = get('DTEND');
    const location = get('LOCATION');
    const url = get('URL');
    if (uid && summary && dtstart) {
      events.push({
        id: uid,
        title: summary,
        starts_at: parseIcalDate(dtstart),
        ends_at: dtend ? parseIcalDate(dtend) : undefined,
        location,
        url,
      });
    }
  }
  return events;
}

function parseIcalDate(dateStr: string): string {
  // Handle both 20250601T120000Z and 20250601 formats
  const clean = dateStr.replace(/[TZ]/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}T00:00:00Z`;
  }
  return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}T${clean.slice(8,10)}:${clean.slice(10,12)}:${clean.slice(12,14)}Z`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get all groups with timetree_url
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, timetree_url")
    .not("timetree_url", "is", null);

  let totalNew = 0;

  for (const group of groups ?? []) {
    const events = await fetchTimetreeEvents(group.timetree_url);

    for (const event of events) {
      const hash = contentHash(event);
      const { data: existing } = await supabase
        .from("group_events")
        .select("id, content_hash, notified_at")
        .eq("source", "timetree")
        .eq("source_event_id", event.id)
        .eq("group_id", group.id)
        .maybeSingle();

      if (!existing) {
        // New event — insert and will push below
        await supabase.from("group_events").insert({
          group_id: group.id,
          source: "timetree",
          source_event_id: event.id,
          title: event.title,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          location: event.location,
          url: event.url,
          content_hash: hash,
        });
        totalNew++;
      } else {
        // Update last_seen_at (and content_hash if changed)
        const updates: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
        if (existing.content_hash !== hash) updates.content_hash = hash;
        await supabase.from("group_events").update(updates).eq("id", existing.id);
      }
    }
  }

  // Send push for all newly inserted events (notified_at IS NULL)
  const { data: newEvents } = await supabase
    .from("group_events")
    .select("id, group_id, title, url, groups(name)")
    .is("notified_at", null);

  for (const evt of newEvents ?? []) {
    // Find users who favorited this group
    const { data: favUsers } = await supabase
      .from("user_favorites")
      .select("user_id")
      .eq("entity_type", "group")
      .eq("entity_id", evt.group_id);

    const userIds = (favUsers ?? []).map((f: any) => f.user_id);
    if (userIds.length === 0) {
      // Mark as notified even if no subscribers (prevents re-trigger)
      await supabase.from("group_events").update({ notified_at: new Date().toISOString() }).eq("id", evt.id);
      continue;
    }

    // Call shared send-push-notification function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        user_ids: userIds,
        notification: {
          title: `${(evt as any).groups?.name ?? ''} 新增活動`,
          body: evt.title,
          icon: "/icons/icon-192x192.png",
          data: {
            onActionClick: {
              default: { operation: "navigateLastFocusedOrOpen", url: `/group/${evt.group_id}` },
            },
          },
        },
      }),
    });

    await supabase.from("group_events").update({ notified_at: new Date().toISOString() }).eq("id", evt.id);
  }

  return new Response(
    JSON.stringify({ newEvents: totalNew, pushed: newEvents?.length ?? 0 }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
```

- [ ] **Step 2: Deploy Edge Function**

```bash
npx supabase functions deploy sync-group-events --no-verify-jwt
```

> **範圍說明**：此函式目前只實作 TimeTree（via public iCal URL）。Google Calendar 需要 OAuth token 和不同的 API 流程，留作後續 follow-up。若 group 沒有 `timetree_url`，該 group 的活動不會被同步。

- [ ] **Step 3: 在 Supabase Dashboard 設定 cron schedule**

前往 Supabase Dashboard > Database > Extensions，啟用 `pg_cron`。

然後在 SQL editor 執行：

```sql
select cron.schedule(
  'sync-group-events',
  '*/30 * * * *',  -- 每 30 分鐘
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/sync-group-events',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);
```

> 若 `app.supabase_url` 未設定，直接填入你的 Supabase URL 字串。

---

### Task 6: notify-new-song Edge Function

**Files:**
- Create: `supabase/functions/notify-new-song/index.ts`

- [ ] **Step 1: 建立 Edge Function**

`supabase/functions/notify-new-song/index.ts`：

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Webhook payload: { type: "INSERT", table: "group_songs"|"member_songs", record: {...} }
  const payload = await req.json();
  const record = payload.record;
  if (!record) return new Response("no record", { status: 400 });

  const isGroupSong = payload.table === "group_songs";
  const entityType = isGroupSong ? "group" : "member";
  const entityId = isGroupSong ? record.group_id : record.member_id;

  if (!entityId) return new Response("no entity", { status: 400 });

  // Get entity name
  let entityName = "";
  if (isGroupSong) {
    const { data } = await supabase.from("groups").select("name").eq("id", entityId).single();
    entityName = data?.name ?? "";
  } else {
    const { data } = await supabase.from("members").select("name").eq("id", entityId).single();
    entityName = data?.name ?? "";
  }

  // Find users who favorited this entity
  const { data: favUsers } = await supabase
    .from("user_favorites")
    .select("user_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

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
      notification: {
        title: `${entityName} 新增歌曲`,
        body: record.title ?? "新歌上線",
        icon: "/icons/icon-192x192.png",
        data: {
          onActionClick: {
            default: {
              operation: "navigateLastFocusedOrOpen",
              url: isGroupSong ? `/group/${entityId}` : `/member/${entityId}`,
            },
          },
        },
      },
    }),
  });

  return new Response("ok", { status: 200 });
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy notify-new-song --no-verify-jwt
```

- [ ] **Step 3: 在 Supabase Dashboard 設定 Database Webhook**

前往 Supabase Dashboard > Database > Webhooks > Create Webhook：

- **Name**: `notify-new-group-song`
- **Table**: `group_songs`
- **Events**: `INSERT`
- **URL**: `https://<your-project>.supabase.co/functions/v1/notify-new-song`
- **HTTP Headers**: `Authorization: Bearer <service_role_key>`

重複以上步驟，建立第二個 webhook：
- **Name**: `notify-new-member-song`
- **Table**: `member_songs`
- **Events**: `INSERT`
- **URL**: 同上

---

### Task 7: notify-status-change Edge Function

**Files:**
- Create: `supabase/functions/notify-status-change/index.ts`

- [ ] **Step 1: 建立 Edge Function**

`supabase/functions/notify-status-change/index.ts`：

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NOTIFIABLE_STATUSES = ['active', 'graduated', 'withdrawn', 'hiatus'];

const STATUS_LABELS: Record<string, string> = {
  graduated: '畢業',
  withdrawn: '退出',
  hiatus: '進入休息',
  active: '復歸',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const payload = await req.json();
  const record = payload.record;
  const oldRecord = payload.old_record;

  if (!record?.member_id) return new Response("no member_id", { status: 400 });

  const newStatus = record.status;
  const oldStatus = oldRecord?.status;

  // Only trigger on notifiable status values AND only if status actually changed
  if (!NOTIFIABLE_STATUSES.includes(newStatus)) return new Response("not notifiable", { status: 200 });
  if (payload.type === "UPDATE" && oldStatus === newStatus) return new Response("no change", { status: 200 });

  // Get member name
  const { data: member } = await supabase
    .from("members")
    .select("name")
    .eq("id", record.member_id)
    .single();

  if (!member) return new Response("member not found", { status: 200 });

  // Find users who favorited this member
  const { data: favUsers } = await supabase
    .from("user_favorites")
    .select("user_id")
    .eq("entity_type", "member")
    .eq("entity_id", record.member_id);

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
      notification: {
        title: `${member.name} 狀態更新`,
        body: STATUS_LABELS[newStatus] ?? newStatus,
        icon: "/icons/icon-192x192.png",
        data: {
          onActionClick: {
            default: {
              operation: "navigateLastFocusedOrOpen",
              url: `/member/${record.member_id}`,
            },
          },
        },
      },
    }),
  });

  return new Response("ok", { status: 200 });
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy notify-status-change --no-verify-jwt
```

- [ ] **Step 3: 設定 history table Database Webhook**

前往 Supabase Dashboard > Database > Webhooks > Create Webhook：

- **Name**: `notify-history-status-change`
- **Table**: `history`
- **Events**: `INSERT`, `UPDATE`
- **URL**: `https://<your-project>.supabase.co/functions/v1/notify-status-change`
- **HTTP Headers**: `Authorization: Bearer <service_role_key>`

---

### Task 8: PushNotificationService — 測試先行

**Files:**
- Create: `src/app/core/push-notification.service.ts`
- Create: `src/app/core/push-notification.service.spec.ts`

- [ ] **Step 1: 寫測試**

`src/app/core/push-notification.service.spec.ts`：

```typescript
import { TestBed } from '@angular/core/testing';
import { PushNotificationService } from './push-notification.service';
import { SwPush } from '@angular/service-worker';
import { SupabaseService } from './supabase.service';
import { PLATFORM_ID } from '@angular/core';

const mockSwPush = {
  isEnabled: false,
  requestSubscription: jasmine.createSpy('requestSubscription').and.returnValue(
    Promise.resolve({
      endpoint: 'https://push.example.com/sub',
      toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
    })
  ),
};

const mockDb = {
  from: jasmine.createSpy('from').and.returnValue({
    upsert: jasmine.createSpy('upsert').and.returnValue(Promise.resolve({ error: null })),
    delete: jasmine.createSpy('delete').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue({
        eq: jasmine.createSpy('eq2').and.returnValue(Promise.resolve({ error: null })),
      }),
    }),
  }),
};

describe('PushNotificationService', () => {
  let service: PushNotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PushNotificationService,
        { provide: SwPush, useValue: mockSwPush },
        { provide: SupabaseService, useValue: {
          client: mockDb,
          getSessionOnce: () => Promise.resolve({ user: { id: 'u-1' } }),
        }},
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    service = TestBed.inject(PushNotificationService);
  });

  it('should create', () => expect(service).toBeTruthy());

  it('isSupported returns false when swPush.isEnabled is false', () => {
    expect(service.isSupported()).toBeFalse();
  });
});
```

- [ ] **Step 2: 執行確認 FAIL**

```bash
npm test -- --include="**/push-notification.service.spec.ts" 2>&1 | tail -10
```

- [ ] **Step 3: 實作 PushNotificationService**

`src/app/core/push-notification.service.ts`：

```typescript
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SwPush } from '@angular/service-worker';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private swPush = inject(SwPush);
  private supabase = inject(SupabaseService);
  private platformId = inject(PLATFORM_ID);

  private get db() { return this.supabase.client; }

  isSupported(): boolean {
    return isPlatformBrowser(this.platformId) && this.swPush.isEnabled;
  }

  get permission(): NotificationPermission | 'default' {
    if (!isPlatformBrowser(this.platformId)) return 'default';
    return Notification.permission;
  }

  async subscribe(): Promise<void> {
    if (!this.isSupported()) throw new Error('Push not supported');

    const session = await this.supabase.getSessionOnce();
    if (!session) throw new Error('Not logged in');

    const sub = await this.swPush.requestSubscription({
      serverPublicKey: environment.vapidPublicKey,
    });

    const json = sub.toJSON();
    await this.db.from('push_subscriptions').upsert({
      user_id: session.user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.['p256dh'] ?? '',
      auth_key: json.keys?.['auth'] ?? '',
    }, { onConflict: 'user_id,endpoint' });
  }

  async unsubscribe(): Promise<void> {
    if (!this.isSupported()) return;
    const session = await this.supabase.getSessionOnce();
    if (!session) return;

    const sub = await this.swPush.subscription.toPromise();
    if (!sub) return;

    await sub.unsubscribe();
    await this.db.from('push_subscriptions')
      .delete()
      .eq('user_id', session.user.id)
      .eq('endpoint', sub.endpoint);
  }
}
```

- [ ] **Step 4: 執行確認 PASS**

```bash
npm test -- --include="**/push-notification.service.spec.ts" 2>&1 | tail -10
```

Expected：`2 specs, 0 failures`

---

### Task 9: 更新 PushSettingsComponent 為真實實作

**Files:**
- Modify: `src/app/pages/my-favorites/push-settings.component.ts`

- [ ] **Step 1: 替換 Plan 2 的 placeholder 為真實訂閱 UI**

`src/app/pages/my-favorites/push-settings.component.ts`：

```typescript
import { Component, OnInit, signal, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PushNotificationService } from '../../core/push-notification.service';

@Component({
  selector: 'app-push-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:20px;max-width:480px;">
      <div style="font-size:0.55rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);margin-bottom:16px;">推播通知設定</div>

      @if (!pushService.isSupported()) {
        <div style="padding:16px;background:rgba(253,224,71,0.1);border:1px solid rgba(253,224,71,0.5);border-radius:12px;font-size:0.72rem;color:var(--text-primary);line-height:1.6;">
          ⚠️ 你的環境不支援推播通知。<br>
          iOS 用戶請先<strong>「加入主畫面」</strong>後開啟（需 iOS 16.4+）。
        </div>
      } @else {
        <!-- Permission status -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(232,121,160,0.08);">
          <div>
            <div style="font-size:0.72rem;font-weight:600;color:var(--text-primary);">推播通知</div>
            <div style="font-size:0.6rem;color:var(--text-faint-55);margin-top:2px;">
              {{ permissionLabel() }}
            </div>
          </div>
          @if (permission() === 'granted') {
            <button (click)="unsubscribe()" [disabled]="loading()"
              style="font-size:0.65rem;padding:5px 12px;border-radius:10px;border:1px solid rgba(232,121,160,0.3);background:transparent;cursor:pointer;color:var(--text-faint-75);">
              {{ loading() ? '處理中…' : '取消訂閱' }}
            </button>
          } @else {
            <button (click)="subscribe()" [disabled]="loading()"
              style="font-size:0.65rem;padding:5px 12px;border-radius:10px;border:none;background:rgba(232,121,160,1);color:white;cursor:pointer;">
              {{ loading() ? '處理中…' : '開啟通知' }}
            </button>
          }
        </div>

        @if (error()) {
          <div style="margin-top:10px;font-size:0.65rem;color:rgba(192,80,128,0.8);">{{ error() }}</div>
        }

        <!-- Notification types info -->
        <div style="margin-top:16px;font-size:0.65rem;color:var(--text-faint-55);line-height:1.8;">
          開啟後，當最愛的團體或成員發生以下事件時將收到通知：<br>
          📅 新增活動　🎵 新增歌曲　⚡ 成員狀態異動
        </div>
      }

      <!-- iOS tip -->
      <div style="margin-top:16px;padding:12px 14px;background:rgba(147,197,253,0.08);border:1px solid rgba(147,197,253,0.25);border-radius:10px;font-size:0.65rem;color:var(--text-faint-75);line-height:1.7;">
        📱 <strong>iOS 推播說明</strong>：需使用 Safari 開啟，並「加入主畫面」後才能啟用推播（iOS 16.4+）。
      </div>
    </div>
  `,
})
export class PushSettingsComponent implements OnInit {
  readonly pushService = inject(PushNotificationService);
  private platformId = inject(PLATFORM_ID);

  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit(): void {}

  permission(): NotificationPermission | 'default' {
    return this.pushService.permission;
  }

  permissionLabel(): string {
    const p = this.permission();
    return p === 'granted' ? '已開啟' : p === 'denied' ? '已封鎖（請至瀏覽器設定開啟）' : '尚未開啟';
  }

  async subscribe(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.pushService.subscribe();
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
    } catch (e: any) {
      this.error.set(e?.message ?? '取消失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }
}
```

---

### Task 10: Backfill Migration + Deploy + Commit

**Files:**
- Create: `supabase/migrations/058_backfill_group_events_notified.sql`

- [ ] **Step 1: 建立 backfill migration（防首次同步全推播）**

`supabase/migrations/058_backfill_group_events_notified.sql`：

```sql
-- Migration 058: Backfill notified_at for all existing group_events to prevent
-- mass push notification on first cron run after feature launch.
-- Only events with first_seen_at AFTER this migration runs should be pushed.

update group_events
set notified_at = now()
where notified_at is null;
```

- [ ] **Step 2: 套用 migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Deploy 所有 Edge Functions**

```bash
npx supabase functions deploy send-push-notification --no-verify-jwt
npx supabase functions deploy notify-new-song --no-verify-jwt
npx supabase functions deploy notify-status-change --no-verify-jwt
```

- [ ] **Step 4: 手動觸發 sync-group-events 確認同步正常**

```bash
curl -X POST https://<your-project>.supabase.co/functions/v1/sync-group-events \
  -H "Authorization: Bearer <anon_key>"
```

Expected 回傳：`{"newEvents":0,"pushed":0}`（backfill 後已全部設 notified_at）

下次有真正新活動被加入 TimeTree 時，cron 執行後 `newEvents` 才會 > 0。

- [ ] **Step 5: 手動測試推播**

在瀏覽器開啟 `/my-favorites` > 通知設定，點「開啟通知」，確認 `push_subscriptions` table 有新增一筆記錄。

在 Supabase SQL Editor 執行（把 `<user_id>` 換成你的）：

```sql
select * from push_subscriptions where user_id = '<user_id>';
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/056_add_group_events.sql \
        supabase/migrations/057_add_push_subscriptions.sql \
        supabase/migrations/058_backfill_group_events_notified.sql \
        supabase/functions/ \
        src/app/core/push-notification.service.ts \
        src/app/core/push-notification.service.spec.ts \
        src/app/pages/my-favorites/push-settings.component.ts \
        src/environments/
git commit -m "feat(push): add event sync cron, push notification Edge Functions, and PushNotificationService"
```

---

## 驗證清單

- [ ] `group_events` table 存在，有 RLS
- [ ] `push_subscriptions` table 存在，有 RLS
- [ ] `sync-group-events` cron 每 30 分鐘執行，Supabase Logs 可見
- [ ] 有 timetree_url 的 group 在 cron 後出現在 `group_events`
- [ ] 追蹤了有 TimeTree 的團體，新活動加入後收到推播
- [ ] `notify-new-song` webhook 觸發後，追蹤者收到推播
- [ ] `notify-status-change` webhook 在 history 狀態改變時觸發
- [ ] `/my-favorites` 通知設定 tab 可開啟/關閉推播
- [ ] iOS 16.4+ 加入主畫面後可收到推播
- [ ] `ng test` 無新增 failure
