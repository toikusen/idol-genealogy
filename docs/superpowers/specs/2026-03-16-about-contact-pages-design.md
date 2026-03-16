# About & Contact Pages Implementation Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/about` (關於我們) and `/contact` (聯絡我們) public pages, with a Supabase-backed `team_members` table editable by editor/admin roles via a new `/admin/team` page.

**Architecture:** Two standalone lazy-loaded Angular components matching the `/privacy` page aesthetic. Team member data stored in Supabase with full CRUD in admin panel. Contact page is fully static.

**Tech Stack:** Angular 17+ standalone components, Supabase JS client, existing `SeoService`, existing `AdminRoleService` pattern.

---

## Pages Overview

### `/about` — 關於我們
- Static header (英文小標 "About" + 大標「關於我們」)
- Website introduction section (hardcoded text explaining what the site is and why it was built)
- Editorial team section — fetched from Supabase `team_members` table; rendered as card list with circular avatar (photo or initial fallback), name, bio, social links (IG / X)
- Page footer (italic tagline, same as privacy page)
- SEO: `setPage()` with title/description

### `/contact` — 聯絡我們
- Static header (英文小標 "Contact" + 大標「聯絡我們」)
- Short explanation text: 「有任何資料錯誤、補充建議，歡迎透過以下方式聯絡」
- Email contact block — hardcoded placeholder `your-email@gmail.com` (to be replaced once decided)
- Page footer (italic tagline)
- SEO: `setPage()` with title/description

---

## Database

### `team_members` table

```sql
CREATE TABLE team_members (
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
```

**RLS policies:**
- SELECT: public (no auth required)
- INSERT / UPDATE / DELETE: `auth.uid() is not null` (editor + admin both allowed)

**Trigger:** `CREATE OR REPLACE TRIGGER team_members_updated_at BEFORE UPDATE ON team_members FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime(updated_at);`

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

Methods:
- `getAll(): Promise<TeamMember[]>` — `SELECT * ORDER BY sort_order ASC, created_at ASC`
- `create(member: Partial<TeamMember>): Promise<void>`
- `update(id: string, member: Partial<TeamMember>): Promise<void>`
- `delete(id: string): Promise<void>`

---

## Admin Page (`/admin/team`)

**Component:** `src/app/pages/admin/admin-team/admin-team.component.ts/.html`

**Behaviour:**
- Table listing all team members with columns: 頭貼、名稱、一句話介紹、排序、操作
- "新增成員" button opens inline form
- Edit / Delete buttons per row
- Delete: confirm before executing (same pattern as other admin pages)
- Uses `*ngIf` / `*ngFor` (admin convention)
- No `isAdmin` guard — both editor and admin can manage team members

**Form fields:** 名稱（必填）、一句話介紹、頭貼 URL、Instagram、X、排序

**Nav:** Add 「團隊管理」link to `admin-shell.component.html` nav list

**Route:** Add `{ path: 'team', loadComponent: () => import('./admin-team/admin-team.component').then(m => m.AdminTeamComponent) }` inside the admin children array in `app.routes.ts`

---

## Routing Changes (`src/app/app.routes.ts`)

Add before the `**` catch-all:
```ts
{ path: 'about', loadComponent: () => import('./pages/about/about.component').then(m => m.AboutComponent) },
{ path: 'contact', loadComponent: () => import('./pages/contact/contact.component').then(m => m.ContactComponent) },
```

---

## Sitemap Update (`public/sitemap.xml`)

Add two new `<url>` entries:
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

## Visual Style

All public pages (`/about`, `/contact`) follow the `/privacy` page aesthetic:
- Background: `linear-gradient(135deg, #fdf6fa 0%, #f5eef8 50%, #fdf6fa 100%)`
- Container: `max-width: 720px; margin: 0 auto; padding: 32px 32px 96px`
- Title font: `'Cormorant Garamond', Georgia, serif; font-weight: 400`
- Body text color: `#4a3050`
- Accent color: `rgba(232,121,160,...)` for borders/dividers
- Back link: `← 返回首頁` with `routerLink="/"`
- Footer tagline: `偶像成員記録 · Idol Archive` italic

Team member cards:
- Horizontal scroll or wrapping flex row
- Circular avatar 64px: `photo_url` if set, else colored circle with name initial
- Name in bold, bio in muted text below
- Social icon links (IG globe icon / X bird icon) if set

---

## Footer / Nav Entry Points

Add links to `/about` and `/contact` in the home page footer area (or wherever existing footer links like `/privacy` appear).
