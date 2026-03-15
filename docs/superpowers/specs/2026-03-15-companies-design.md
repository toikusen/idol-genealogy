# Companies Feature Design
**Date:** 2026-03-15
**Status:** Approved

## Summary

Add a `companies` table so each talent agency has its own page, logo, and metadata. Groups reference companies via a foreign key. The company page follows a banner + circular logo + chip-list style (Twitter/IG profile aesthetic).

---

## Database

### New table: `companies` (migration: `021_create_companies.sql`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | gen_random_uuid() |
| `name` | text NOT NULL | Display name |
| `description` | text | Short bio |
| `photo_url` | text | Logo / profile photo |
| `color` | text | Banner/brand color (CSS hex or name) |
| `instagram` | text | URL |
| `facebook` | text | URL |
| `x` | text | URL |
| `youtube` | text | URL |
| `website` | text | Company website URL |
| `founded_at` | date | Optional founding date |
| `created_at` | timestamptz | DEFAULT now() |
| `updated_at` | timestamptz | DEFAULT now() |

**RLS policies:**
- `SELECT`: public (anon role) — company info is public
- `INSERT / UPDATE / DELETE`: authenticated users only (same pattern as groups)

**`updated_at` trigger:** Migration `021` must attach the existing `moddatetime` trigger (or equivalent already used on other tables) to `companies.updated_at` so it auto-updates on every UPDATE. Without this, `updated_at` stays at insert time forever.

### Changes to `groups` table (migration: `022_add_company_id_to_groups.sql`)

- Add `company_id uuid REFERENCES companies(id) ON DELETE SET NULL` (nullable)
- Keep existing `company` text column — not removed in this iteration, used for legacy display
- Migration sequence verified: current latest is `020_add_photo_url_to_groups.sql`

---

## Models (`src/app/models/index.ts`)

### New `Company` interface

```typescript
export interface Company {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  color: string | null;
  instagram: string | null;
  facebook: string | null;
  x: string | null;
  youtube: string | null;
  website: string | null;
  founded_at: string | null;  // stored as Postgres `date`, returned as YYYY-MM-DD string by JS client
  created_at: string;
  updated_at: string;
}
```

### Updated `Group` interface

Add to existing interface in `src/app/models/index.ts`:
- `company_id: string | null` — new FK field
- Keep `company: string | null` — legacy field, retained for backward compatibility

---

## Routing (`src/app/app.routes.ts`)

Add the following routes:

| Route | Component | Guard | Notes |
|-------|-----------|-------|-------|
| `/company/:id` | `CompanyPageComponent` | none | New public top-level route — insert **before** the `**` wildcard, alongside `/companies` |
| `/admin/companies` | `AdminCompaniesComponent` | `authGuard` (inherited from shell) | Child of admin shell |

- Delete inside `AdminCompaniesComponent` is **admin-only** (`isAdmin` check, same pattern as member/group delete buttons) — deleting a company sets `company_id` to null on all its groups via `ON DELETE SET NULL`, so it is a destructive operation.
- The existing `/companies` route (`CompaniesComponent`) is updated in-place.

---

## Company Page (`/company/:id`)

Visual style: Banner + circular logo overlap (option C)

### Layout
1. **Banner** — full-width solid color strip using `company.color` (fallback: dark gradient `#1a1a2e → #2d1b4e`). Height ~120px.
2. **Logo** — 80px circle overlapping banner bottom edge, white border ring. Fallback: first letter of company name with color background.
3. **Info section** — name (large), description, SNS pill links (IG / FB / X / YouTube / Website)
4. **Groups section** — labelled "旗下組合":
   - Active sub-row: groups where `disbanded_at` is null (colored border chips)
   - Disbanded sub-row: groups where `disbanded_at` is not null (grey chips)
   - Each chip: group color dot + name, links to `/group/:id`
   - `getGroupsByCompany` fetches **all** groups (active + disbanded); component splits them by `disbanded_at`
5. **Empty state**: "目前無旗下組合" when no groups found
6. **Footer** — consistent with rest of site (privacy link)

### States
- Loading, error, not-found (consistent with existing member/group pages)

---

## Companies List Page (`/companies`)

Update existing `CompaniesComponent`:

### Data sources (two coexist during transition)
- **FK-linked companies**: fetched via `CompanyService.getAll()`, displayed as logo cards linking to `/company/:id`
- **Legacy string-only companies**: groups where `company_id` is null but `company` text is not null — grouped by string value, displayed as text sections (existing behavior)
- **De-duplication rule**: if a company name in the legacy string matches a record in the companies table, the company card takes precedence and the legacy string section is suppressed for that company name
- **「獨立・其他」bucket**: groups where both `company_id` is null AND `company` text is null — still displayed in the existing "獨立・其他" fallback section at the bottom, unchanged

### Card layout
- Company logo circle (fallback: initial letter + color)
- Company name
- Active group count
- Link to `/company/:id`

---

## New Service: `CompanyService` (`src/app/core/company.service.ts`)

```typescript
getAll(): Promise<Company[]>
getById(id: string): Promise<Company | null>
getGroupsByCompany(companyId: string): Promise<Group[]>  // all groups (active + disbanded), queried directly from 'groups' table — no GroupService injection
create(data: Partial<Company>): Promise<void>
update(id: string, data: Partial<Company>): Promise<void>
delete(id: string): Promise<void>
```

`CompanyService` queries the Supabase `groups` table directly (consistent with the project pattern where each service owns its primary table query). It does **not** inject `GroupService` to avoid circular dependencies.

---

## Admin: Companies Management (`/admin/companies`)

New `AdminCompaniesComponent`. Guard: `authGuard` (same as members/groups).

### Table columns
| Column | Notes |
|--------|-------|
| Logo | Avatar circle with fallback initial |
| 名稱 | Company name |
| 簡介 | Truncated description |
| 旗下組合數 | Count from loaded groups |
| 操作 | 編輯 / 刪除 |

### Create/Edit Modal fields (in order)
1. 公司名稱 (required)
2. 頭像 URL + 從 IG 抓取 button
3. 代表色 (color picker + hex/name input)
4. 簡介
5. 網站 URL
6. Instagram / Facebook / X / YouTube
7. 成立日期

### IG Fetch
Same pattern as members and groups: calls `/functions/v1/ig-photo` Edge Function with username extracted from Instagram URL. Button enabled only when Instagram URL is filled.

---

## Admin: Groups — Company Field Update

In `AdminGroupsComponent` edit/create modal, replace the `company` free-text input with:
- A `<select>` dropdown populated from `CompanyService.getAll()`
- Options: `— 無 —` (sets `company_id = null`), then each company by name
- Selecting sets `company_id`; the legacy `company` text field is **not** cleared (kept for backward compat)
- Free-text `company` field remains below the dropdown as a secondary fallback input (labelled "自定義事務所名稱（若未建立公司頁）")

---

## Admin Shell

Add "公司管理" nav link in `AdminShellComponent` sidebar before or after "組合管理", pointing to `/admin/companies`.

---

## SEO (`CompanyPageComponent`)

Call `SeoService.setPage(...)` after loading company data:
- **Title**: `"{company.name} | 台灣地下偶像族譜"`
- **Description**: `"{company.name}旗下組合與成員記錄。"` (or `company.description` if available)
- **og:image**: `company.photo_url` if set, otherwise falls back to `og-default.png` (existing site default)
- **JSON-LD**: `Organization` type with `name`, `url`, `logo` fields

---

## Data Migration Strategy

No automated migration. Manual workflow:
1. Admin creates company records in `/admin/companies`
2. Admin edits each group, selects the corresponding company from the new dropdown
3. Legacy `company` text column is preserved and not removed in this iteration
