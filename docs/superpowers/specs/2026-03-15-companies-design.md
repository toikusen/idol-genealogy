# Companies Feature Design
**Date:** 2026-03-15
**Status:** Approved

## Summary

Add a `companies` table so each talent agency has its own page, logo, and metadata. Groups reference companies via a foreign key. The company page follows a banner + circular logo + chip-list style (Twitter/IG profile aesthetic).

---

## Database

### New table: `companies`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | gen_random_uuid() |
| `name` | text NOT NULL | Display name |
| `description` | text | Short bio |
| `photo_url` | text | Logo / profile photo |
| `instagram` | text | URL |
| `facebook` | text | URL |
| `x` | text | URL |
| `youtube` | text | URL |
| `website` | text | Company website URL |
| `founded_at` | date | Optional founding date |
| `created_at` | timestamptz | DEFAULT now() |
| `updated_at` | timestamptz | DEFAULT now() |

### Changes to `groups` table

- Add `company_id uuid REFERENCES companies(id) ON DELETE SET NULL` (nullable)
- Keep existing `company` text column during transition; do not remove it yet
- Existing group-company relationships are re-linked manually via admin after companies are created

---

## Routing

| Route | Component | Notes |
|-------|-----------|-------|
| `/company/:id` | `CompanyPageComponent` | New — public company detail page |
| `/companies` | `CompaniesComponent` | Existing — update to show company cards with logos |
| `/admin/companies` | `AdminCompaniesComponent` | New — CRUD management |

---

## Company Page (`/company/:id`)

Visual style: option C (banner + logo overlap)

### Layout
1. **Banner** — full-width solid color strip using company's brand color (fallback: dark gradient). Height ~120px.
2. **Logo** — 80px circle overlapping banner bottom edge, with white border ring
3. **Info section** — name (large), description, SNS pill links (IG / FB / X / YouTube / website)
4. **Groups section** — labelled "旗下組合", two sub-rows: active groups (colored border chips) and disbanded groups (grey chips). Each chip shows group color dot + name, links to `/group/:id`.
5. **Footer** — consistent with rest of site

### States
- Loading, error, not-found (consistent with existing pages)
- No groups: show "目前無旗下組合" message

---

## Companies List Page (`/companies`)

Update existing `CompaniesComponent`:
- Replace text-only company sections with card grid
- Each card: company logo circle (fallback: initial letter), name, active group count, link to `/company/:id`
- Companies without a `companies` record (legacy string-only) remain displayed as text sections as before

---

## Admin: Companies Management (`/admin/companies`)

New `AdminCompaniesComponent`, consistent with `AdminMembersComponent` and `AdminGroupsComponent`.

### Table columns
- Logo (avatar circle with fallback initial)
- 名稱
- 簡介（truncated）
- 旗下組合數
- 操作（編輯 / 刪除）

### Create/Edit Modal
Fields in order:
1. 公司名稱 (required)
2. 頭像 URL + 從 IG 抓取 button (same pattern as members/groups)
3. 簡介
4. 網站
5. Instagram / Facebook / X / YouTube
6. 成立日期

### IG Fetch
Same pattern as members and groups: uses `/functions/v1/ig-photo` Edge Function, enabled only when Instagram URL is filled.

---

## Admin: Groups — Company Field Update

In `AdminGroupsComponent` edit modal, replace the `company` free-text input with:
- A `<select>` dropdown populated from `CompanyService.getAll()`
- Options: `— 無 —` (null), then each company by name
- Selecting a company sets `company_id`; saving clears the legacy `company` text field (or keeps it in sync for now)

---

## New Services

### `CompanyService`
Methods:
- `getAll(): Promise<Company[]>`
- `getById(id): Promise<Company | null>`
- `getGroupsByCompany(companyId): Promise<Group[]>`
- `create(data): Promise<void>`
- `update(id, data): Promise<void>`
- `delete(id): Promise<void>`

---

## Model

```typescript
export interface Company {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  instagram: string | null;
  facebook: string | null;
  x: string | null;
  youtube: string | null;
  website: string | null;
  founded_at: string | null;
  created_at: string;
  updated_at: string;
}
```

`Group` interface gains `company_id: string | null`.

---

## Migrations

| File | Content |
|------|---------|
| `021_create_companies.sql` | Create `companies` table |
| `022_add_company_id_to_groups.sql` | Add nullable `company_id` FK to groups |

---

## Admin Shell

Add "公司管理" nav link in `AdminShellComponent` sidebar, pointing to `/admin/companies`.

---

## Data Migration Strategy

No automated data migration. Workflow:
1. Admin creates company records via `/admin/companies`
2. Admin edits each group and selects the corresponding company from the new dropdown
3. `company` text column is preserved as-is and not removed in this iteration
