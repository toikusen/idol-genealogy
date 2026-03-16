# About & Contact Pages Implementation Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/about` (關於我們) and `/contact` (聯絡我們) public pages, with a Supabase-backed `team_members` table editable by editor/admin roles via a new `/admin/team` page.

**Architecture:** Two standalone lazy-loaded Angular components matching the `/privacy` page aesthetic. Team member data stored in Supabase with full CRUD in admin panel. Contact page is fully static.

**Tech Stack:** Angular 17+ standalone components, Supabase JS client, existing `SeoService`, existing `AdminRoleService` pattern.

---

## Pages Overview

### `/about` — 關於我們

SEO: call `this.seo.setPage('關於我們 | 台灣地下偶像族譜', '了解台灣地下偶像族譜的成立緣起與編輯團隊。', 'https://idol-genealogy.pages.dev/about')`

Layout sections (top → bottom):
1. `← 返回首頁` back link (`routerLink="/"`)
2. Header: English sub-label "About" + 大標「關於我們」
3. **網站介紹** section — hardcoded text explaining what the site is and why it was built (implementer may use placeholder text; owner will update copy later)
4. **編輯團隊** section — fetched from Supabase `team_members` table; rendered as wrapping flex card list (see Visual Style below)
5. Page footer: italic tagline `偶像成員記録 · Idol Archive`

### `/contact` — 聯絡我們

SEO: call `this.seo.setPage('聯絡我們 | 台灣地下偶像族譜', '有任何資料錯誤或補充建議，歡迎與我們聯絡。', 'https://idol-genealogy.pages.dev/contact')`

Layout sections (top → bottom):
1. `← 返回首頁` back link (`routerLink="/"`)
2. Header: English sub-label "Contact" + 大標「聯絡我們」
3. Short intro text: 「有任何資料錯誤、補充建議，歡迎透過以下方式聯絡。」
4. **Email** block — display `your-email@gmail.com` as a `mailto:` link (owner will replace the address once decided)
5. Page footer: italic tagline `偶像成員記録 · Idol Archive`

---

## Database

### Migration file: `supabase/migrations/023_create_team_members.sql`

```sql
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bio text,
  photo_url text,
  instagram text,
  x text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "team_members_select_public"
  ON team_members FOR SELECT
  USING (true);

-- Authenticated write (editor + admin)
CREATE POLICY "team_members_write_authenticated"
  ON team_members FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime(updated_at);
```

---

## TypeScript Model

Add to `src/app/models/index.ts`:

```ts
export interface TeamMember {
  id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  instagram: string | null;
  x: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

---

## TeamMemberService (`src/app/core/team-member.service.ts`)

All methods throw on error (matching `CompanyService` pattern: `if (error) throw error`).

```ts
async getAll(): Promise<TeamMember[]>   // SELECT * ORDER BY sort_order ASC, created_at ASC
async create(member: Partial<TeamMember>): Promise<void>
async update(id: string, member: Partial<TeamMember>): Promise<void>
async delete(id: string): Promise<void>
```

---

## Admin Page (`/admin/team`)

**Component files:**
- `src/app/pages/admin/admin-team/admin-team.component.ts`
- `src/app/pages/admin/admin-team/admin-team.component.html`

**Template syntax:** Use `*ngIf` / `*ngFor` (admin page convention — same as `admin-members`, `admin-groups`, `admin-companies`). Note: `admin-shell.component.html` uses `@if` syntax — keep that file's existing syntax when adding the nav link there.

**Behaviour:**
- On load: fetch all team members, store in `members: TeamMember[]`
- Table columns: 頭貼（40px circular）、名稱、一句話介紹、排序（display `sort_order` value, read-only in table）、操作
- **新增成員** button at top of page — clicking sets `editing` to a blank `Partial<TeamMember>` and shows the form above the table (same pattern as `AdminMembersComponent`)
- **編輯** button per row — sets `editing` to a copy of that member's data, shows form above table pre-populated
- **刪除** button per row — shows `window.confirm('確定要刪除此成員嗎？')`, calls `delete()` on confirm
- After create/update/delete: reload list
- No `isAdmin` guard — both editor and admin can manage team members (do NOT inject `AdminRoleService`)

**Form fields** (shown above table when `editing` is set):
| Field | Binding | Required |
|-------|---------|----------|
| 名稱 | `editing.name` | Yes |
| 一句話介紹 | `editing.bio` | No |
| 頭貼 URL | `editing.photo_url` | No |
| Instagram | `editing.instagram` | No |
| X (Twitter) | `editing.x` | No |
| 排序 | `editing.sort_order` | No (default 0) |

Submit button: 「儲存」— calls `create()` if new, `update()` if editing existing. Cancel button: 「取消」— clears `editing`.

---

## Routing Changes

### `src/app/app.routes.ts`

Add two public routes **before** the `{ path: '**', redirectTo: '' }` catch-all:
```ts
{ path: 'about', loadComponent: () => import('./pages/about/about.component').then(m => m.AboutComponent) },
{ path: 'contact', loadComponent: () => import('./pages/contact/contact.component').then(m => m.ContactComponent) },
```

Add one admin child route inside the `admin` children array, **before** the `{ path: '', redirectTo: 'members', pathMatch: 'full' }` and `{ path: '**', redirectTo: 'members' }` catch-alls:
```ts
{ path: 'team', loadComponent: () => import('./pages/admin/admin-team/admin-team.component').then(m => m.AdminTeamComponent) },
```

### `src/app/pages/admin/admin-shell/admin-shell.component.html`

Add 「團隊管理」nav link to the existing nav list (file uses `@if` syntax — preserve it). Example:
```html
<a routerLink="/admin/team" routerLinkActive="active">團隊管理</a>
```

---

## Sitemap Update (`public/sitemap.xml`)

Add two new `<url>` entries inside `<urlset>`:
```xml
<url>
  <loc>https://idol-genealogy.pages.dev/about</loc>
  <changefreq>monthly</changefreq>
  <priority>0.4</priority>
</url>
<url>
  <loc>https://idol-genealogy.pages.dev/contact</loc>
  <changefreq>monthly</changefreq>
  <priority>0.4</priority>
</url>
```

---

## Footer Links (`src/app/pages/home/home.component.html`)

The `/privacy` link already exists in the home page footer. Add `/about` and `/contact` links next to it in the same footer area.

---

## Visual Style

All public pages (`/about`, `/contact`) follow the `/privacy` page aesthetic exactly:
- Background: `linear-gradient(135deg, #fdf6fa 0%, #f5eef8 50%, #fdf6fa 100%)`
- Container: `max-width: 720px; margin: 0 auto; padding: 32px 32px 96px`
- Title font: `'Cormorant Garamond', Georgia, serif; font-weight: 400; font-size: 2rem; color: #3a2040`
- English sub-label: `font-family: 'Shippori Mincho', serif; font-size: 0.7rem; letter-spacing: 0.4em; color: rgba(232,121,160,0.6); text-transform: uppercase`
- Body text: `color: #4a3050; line-height: 1.9; font-size: 0.92rem`
- Section dividers: `border-bottom: 1px solid rgba(232,121,160,0.15)`
- Back link: `color: rgba(122,90,122,0.7); font-size: 0.78rem`

### Team member cards (on `/about`)

Wrapping flex row (`flex-wrap: wrap; gap: 16px`). Each card:
- Circular avatar 64px: if `photo_url` set, show `<img>` with `border-radius: 50%`; else show a circle with `background: rgba(232,121,160,0.15); color: #c2507a` displaying the first character of `name`
- `name` in bold (`font-weight: 600; color: #3a2040`)
- `bio` in muted text below (`color: rgba(122,90,122,0.7); font-size: 0.82rem`)
- Social links: inline SVG icons (same approach as existing SVG usage in the project — no icon library). Show IG link if `instagram` set, X link if `x` set. Open in new tab with `target="_blank" rel="noopener"`

### Avatar fallback color

Use fixed brand color: `background: rgba(232,121,160,0.15); color: #c2507a` (consistent with accent color throughout the project). Do not use random or hash-based colors.
