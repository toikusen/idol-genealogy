# Companies Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `companies` table so each talent agency gets its own page with logo, description, and SNS links; groups link to companies via FK; admin can manage companies.

**Architecture:** New `companies` Supabase table → `CompanyService` → public `CompanyPageComponent` + updated `CompaniesComponent` + `AdminCompaniesComponent`. Groups gain a nullable `company_id` FK; the legacy `company` text field is kept. No automated data migration — admins link groups to companies manually.

**Tech Stack:** Angular 17+ standalone components, Supabase JS client, Tailwind CSS (admin), inline styles (public pages), `moddatetime` Supabase extension for `updated_at`.

**Spec:** `docs/superpowers/specs/2026-03-15-companies-design.md`

---

## File Map

| Status | File | Action |
|--------|------|--------|
| Create | `supabase/migrations/021_create_companies.sql` | New companies table + RLS + trigger |
| Create | `supabase/migrations/022_add_company_id_to_groups.sql` | Add company_id FK to groups |
| Modify | `src/app/models/index.ts` | Add Company interface; add company_id to Group |
| Create | `src/app/core/company.service.ts` | CRUD + getGroupsByCompany |
| Create | `src/app/pages/company-page/company-page.component.ts` | Public company detail page logic |
| Create | `src/app/pages/company-page/company-page.component.html` | Banner + logo + groups chips |
| Modify | `src/app/pages/companies/companies.component.ts` | Add FK-linked company cards |
| Modify | `src/app/pages/companies/companies.component.html` | Render company cards + legacy sections |
| Create | `src/app/pages/admin/admin-companies/admin-companies.component.ts` | Admin CRUD logic |
| Create | `src/app/pages/admin/admin-companies/admin-companies.component.html` | Table + modal |
| Modify | `src/app/pages/admin/admin-groups/admin-groups.component.ts` | Load companies for dropdown |
| Modify | `src/app/pages/admin/admin-groups/admin-groups.component.html` | Company select + legacy text field |
| Modify | `src/app/pages/admin/admin-shell/admin-shell.component.html` | Add 公司管理 nav link |
| Modify | `src/app/app.routes.ts` | Add /company/:id + /admin/companies routes |

---

## Chunk 1: Database & Models

### Task 1: Migration — Create companies table

**Files:**
- Create: `supabase/migrations/021_create_companies.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/021_create_companies.sql
CREATE TABLE IF NOT EXISTS companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  photo_url    text,
  color        text,
  instagram    text,
  facebook     text,
  x            text,
  youtube      text,
  website      text,
  founded_at   date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at (moddatetime extension already enabled in migration 001)
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime(updated_at);

-- RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_public"
  ON companies FOR SELECT USING (true);

CREATE POLICY "companies_write_authenticated"
  ON companies FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Paste the file contents into Supabase Dashboard → SQL Editor and execute. Verify the `companies` table appears in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/021_create_companies.sql
git commit -m "db: create companies table with RLS and updated_at trigger"
```

---

### Task 2: Migration — Add company_id to groups

**Files:**
- Create: `supabase/migrations/022_add_company_id_to_groups.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/022_add_company_id_to_groups.sql
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS groups_company_id_idx ON groups(company_id);
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Execute in Dashboard. Verify `groups` table now has `company_id` column (nullable uuid).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/022_add_company_id_to_groups.sql
git commit -m "db: add company_id FK to groups table"
```

---

### Task 3: Update TypeScript models

**Files:**
- Modify: `src/app/models/index.ts`

- [ ] **Step 1: Add Company interface and update Group**

Open `src/app/models/index.ts`. Add the `Company` interface after `GroupVideo`. Update `Group` to include `company_id`.

Add after the `GroupVideo` interface:

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
  founded_at: string | null;
  created_at: string;
  updated_at: string;
}
```

In the existing `Group` interface, add after `name_jp`:

```typescript
  company_id: string | null;
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/seitumbp2025/idol-genealogy
npx ng build --configuration development 2>&1 | grep -E "error|Error" | head -20
```

Expected: no new errors from this change (company_id is optional/nullable so existing code won't break).

- [ ] **Step 3: Commit**

```bash
git add src/app/models/index.ts
git commit -m "feat: add Company interface and company_id to Group model"
```

---

## Chunk 2: CompanyService

### Task 4: Create CompanyService

**Files:**
- Create: `src/app/core/company.service.ts`

- [ ] **Step 1: Write the service**

```typescript
// src/app/core/company.service.ts
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Company, Group } from '../models';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<Company[]> {
    const { data, error } = await this.db
      .from('companies').select('*').order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  // Used by admin table to show group count per company
  async getGroupCounts(): Promise<Record<string, number>> {
    const { data, error } = await this.db
      .from('groups').select('company_id').not('company_id', 'is', null);
    if (error) return {};
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      if (row.company_id) counts[row.company_id] = (counts[row.company_id] ?? 0) + 1;
    }
    return counts;
  }

  async getById(id: string): Promise<Company | null> {
    const { data, error } = await this.db
      .from('companies').select('*').eq('id', id).single();
    if (error) {
      if ((error as any).code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async getGroupsByCompany(companyId: string): Promise<Group[]> {
    const { data, error } = await this.db
      .from('groups').select('*').eq('company_id', companyId);
    if (error) throw error;
    // Active groups first, then disbanded — sorted in component by disbanded_at nullability
    return data ?? [];
  }

  async create(company: Partial<Company>): Promise<void> {
    const { error } = await this.db.from('companies').insert(company);
    if (error) throw error;
  }

  async update(id: string, company: Partial<Company>): Promise<void> {
    const { error } = await this.db.from('companies').update(company).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('companies').delete().eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npx ng build --configuration development 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/company.service.ts
git commit -m "feat: add CompanyService with CRUD and getGroupsByCompany"
```

---

## Chunk 3: Company Page (public)

### Task 5: Create CompanyPageComponent

**Files:**
- Create: `src/app/pages/company-page/company-page.component.ts`
- Create: `src/app/pages/company-page/company-page.component.html`

- [ ] **Step 1: Create the TypeScript component**

```typescript
// src/app/pages/company-page/company-page.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CompanyService } from '../../core/company.service';
import { SeoService } from '../../core/seo.service';
import { Company, Group } from '../../models';

const SITE_URL = 'https://idol-genealogy.pages.dev';

@Component({
  selector: 'app-company-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './company-page.component.html',
})
export class CompanyPageComponent implements OnInit, OnDestroy {
  company: Company | null = null;
  activeGroups: Group[] = [];
  disbandedGroups: Group[] = [];
  loading = true;
  error = false;

  constructor(
    private route: ActivatedRoute,
    private companyService: CompanyService,
    private seo: SeoService
  ) {}

  ngOnDestroy() {
    this.seo.clearJsonLd?.();
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [company, groups] = await Promise.all([
        this.companyService.getById(id),
        this.companyService.getGroupsByCompany(id),
      ]);
      this.company = company;
      this.activeGroups = groups.filter(g => !g.disbanded_at);
      this.disbandedGroups = groups.filter(g => !!g.disbanded_at);

      if (company) {
        this.seo.setPage(
          `${company.name} | 台灣地下偶像族譜`,
          company.description ?? `${company.name}旗下組合與成員記錄。`,
          `${SITE_URL}/company/${id}`,
          company.photo_url ?? undefined
        );
        this.seo.setJsonLd({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: company.name,
          url: `${SITE_URL}/company/${id}`,
          ...(company.photo_url ? { logo: company.photo_url } : {}),
        });
      }
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  getBannerStyle(company: Company): string {
    if (company.color) {
      return `background: ${company.color};`;
    }
    return 'background: linear-gradient(135deg, #1a1a2e 0%, #2d1b4e 100%);';
  }
}
```

- [ ] **Step 2: Create the HTML template**

```html
<!-- src/app/pages/company-page/company-page.component.html -->
<div style="min-height: 100vh; position: relative; overflow-x: hidden;">

  <!-- Ambient background -->
  <div style="
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse 55% 45% at 10% 5%, rgba(124,108,242,0.08) 0%, transparent 60%),
      radial-gradient(ellipse 45% 45% at 90% 85%, rgba(232,121,160,0.07) 0%, transparent 60%);
  "></div>

  <div style="position: relative; z-index: 1; max-width: 760px; margin: 0 auto; padding: 0 32px 96px;">

    <!-- Loading -->
    @if (loading) {
      <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
        <div style="
          width: 36px; height: 36px; border-radius: 50%;
          border: 2px solid rgba(124,108,242,0.15);
          border-top-color: rgba(124,108,242,0.6);
          animation: spin 0.8s linear infinite;
        "></div>
      </div>
    }

    <!-- Error -->
    @if (!loading && error) {
      <div style="text-align:center;padding:80px 0;">
        <p style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:rgba(122,90,122,0.6);">載入失敗</p>
        <a routerLink="/companies" style="font-size:0.8rem;color:rgba(124,108,242,0.7);text-decoration:none;">← 返回事務所列表</a>
      </div>
    }

    <!-- Not found -->
    @if (!loading && !error && company === null) {
      <div style="text-align:center;padding:80px 0;">
        <p style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:rgba(122,90,122,0.6);">找不到此事務所</p>
        <a routerLink="/companies" style="font-size:0.8rem;color:rgba(124,108,242,0.7);text-decoration:none;">← 返回事務所列表</a>
      </div>
    }

    <!-- Company profile -->
    @if (!loading && !error && company !== null) {

      <!-- Back link -->
      <div style="padding-top: 32px; margin-bottom: 0;">
        <a routerLink="/companies" style="
          display:inline-flex;align-items:center;gap:6px;
          font-family:'Shippori Mincho',serif;
          font-size:0.72rem;letter-spacing:0.2em;
          color:rgba(122,90,122,0.5);text-decoration:none;
          transition:color 0.2s;
        ">← 事務所一覽</a>
      </div>

      <!-- ══ Banner + Logo ══ -->
      <div style="margin-top: 24px; position: relative;">
        <!-- Banner -->
        <div [style]="getBannerStyle(company)"
          style="height: 120px; border-radius: 12px; width: 100%;">
        </div>

        <!-- Logo overlapping banner -->
        <div style="position:absolute; bottom:-36px; left:24px;">
          @if (company.photo_url) {
            <img [src]="company.photo_url" [alt]="company.name"
              style="
                width: 80px; height: 80px; border-radius: 50%;
                object-fit: cover;
                border: 3px solid white;
                box-shadow: 0 4px 16px rgba(45,27,46,0.15);
              "/>
          } @else {
            <div [style.background]="company.color || '#7c6cf2'" style="
              width: 80px; height: 80px; border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 4px 16px rgba(45,27,46,0.15);
              display:flex;align-items:center;justify-content:center;
              font-family:'Cormorant Garamond',Georgia,serif;
              font-size:2rem; font-weight:300; color:white;
            ">{{ getInitial(company.name) }}</div>
          }
        </div>
      </div>

      <!-- ══ Info section ══ -->
      <div style="padding-top: 52px; padding-bottom: 36px; border-bottom: 1px solid rgba(124,108,242,0.1);">

        <!-- Label -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="
            font-family:'Shippori Mincho',serif;
            font-size:0.6rem;letter-spacing:0.42em;
            text-transform:uppercase;color:rgba(124,108,242,0.5);
          ">Agency · 事務所</span>
        </div>

        <!-- Name -->
        <h1 style="
          font-family:'Cormorant Garamond',Georgia,serif;
          font-size:clamp(1.8rem,5vw,2.6rem);
          font-weight:400;letter-spacing:0.02em;
          color:#2d1b2e;margin:0 0 8px;
        ">{{ company.name }}</h1>

        <!-- Founded -->
        @if (company.founded_at) {
          <p style="
            font-family:'Shippori Mincho',serif;
            font-size:0.78rem;color:rgba(122,90,122,0.5);
            letter-spacing:0.08em;margin:0 0 12px;
          ">{{ company.founded_at | slice:0:4 }}年成立</p>
        }

        <!-- Description -->
        @if (company.description) {
          <p style="
            font-family:'Shippori Mincho',serif;
            font-size:0.9rem;line-height:1.85;
            color:rgba(60,40,60,0.7);
            max-width:560px;margin:0 0 20px;
          ">{{ company.description }}</p>
        }

        <!-- SNS links -->
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px;">
          @if (company.instagram) {
            <a [href]="company.instagram" target="_blank" rel="noopener noreferrer"
              class="sns-link sns-link--ig">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="2" y="2" width="20" height="20" rx="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none"/>
              </svg>
              <span>Instagram</span>
            </a>
          }
          @if (company.facebook) {
            <a [href]="company.facebook" target="_blank" rel="noopener noreferrer"
              class="sns-link sns-link--fb">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
              </svg>
              <span>Facebook</span>
            </a>
          }
          @if (company.x) {
            <a [href]="company.x" target="_blank" rel="noopener noreferrer"
              class="sns-link sns-link--x">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span>X</span>
            </a>
          }
          @if (company.youtube) {
            <a [href]="company.youtube" target="_blank" rel="noopener noreferrer"
              class="sns-link sns-link--yt">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span>YouTube</span>
            </a>
          }
          @if (company.website) {
            <a [href]="company.website" target="_blank" rel="noopener noreferrer"
              class="sns-link sns-link--web">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              <span>官網</span>
            </a>
          }
        </div>
      </div>

      <!-- ══ Groups section ══ -->
      <section style="margin-top: 44px;">

        <div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;">
          <div style="height:1px;width:20px;background:rgba(124,108,242,0.45);"></div>
          <span style="
            font-family:'Shippori Mincho',serif;
            font-size:0.65rem;letter-spacing:0.38em;
            text-transform:uppercase;color:rgba(124,108,242,0.55);
            white-space:nowrap;
          ">旗下組合</span>
          <div style="flex:1;height:1px;background:linear-gradient(to right,rgba(124,108,242,0.2),transparent);"></div>
        </div>

        <!-- No groups -->
        @if (activeGroups.length === 0 && disbandedGroups.length === 0) {
          <p style="font-family:'Shippori Mincho',serif;font-size:0.85rem;color:rgba(122,90,122,0.45);">目前無旗下組合</p>
        }

        <!-- Active groups -->
        @if (activeGroups.length > 0) {
          <div style="margin-bottom:24px;">
            <p style="
              font-family:'Shippori Mincho',serif;
              font-size:0.68rem;letter-spacing:0.2em;
              color:rgba(122,90,122,0.45);margin:0 0 12px;
            ">現役</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              @for (g of activeGroups; track g.id) {
                <a [routerLink]="['/group', g.id]"
                  style="
                    display:inline-flex;align-items:center;gap:6px;
                    padding:6px 14px;border-radius:20px;
                    border: 1px solid; text-decoration:none;
                    font-family:'Shippori Mincho',serif;font-size:0.82rem;
                    transition:all 0.2s;
                  "
                  [style.borderColor]="g.color || '#7c6cf2'"
                  [style.color]="g.color || '#7c6cf2'"
                  [style.background]="(g.color || '#7c6cf2') + '12'"
                >
                  <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;"
                    [style.background]="g.color || '#7c6cf2'"></span>
                  {{ g.name_jp || g.name }}
                </a>
              }
            </div>
          </div>
        }

        <!-- Disbanded groups -->
        @if (disbandedGroups.length > 0) {
          <div>
            <p style="
              font-family:'Shippori Mincho',serif;
              font-size:0.68rem;letter-spacing:0.2em;
              color:rgba(122,90,122,0.4);margin:0 0 12px;
            ">解散・活動停止</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              @for (g of disbandedGroups; track g.id) {
                <a [routerLink]="['/group', g.id]"
                  style="
                    display:inline-flex;align-items:center;gap:6px;
                    padding:6px 14px;border-radius:20px;
                    border:1px solid rgba(180,160,180,0.3);
                    color:rgba(122,90,122,0.5);
                    background:rgba(180,160,180,0.06);
                    text-decoration:none;
                    font-family:'Shippori Mincho',serif;font-size:0.82rem;
                    transition:all 0.2s;
                  "
                >
                  <span style="width:8px;height:8px;border-radius:50%;background:rgba(160,140,160,0.35);flex-shrink:0;"></span>
                  {{ g.name_jp || g.name }}
                </a>
              }
            </div>
          </div>
        }

      </section>

      <!-- Footer -->
      <footer style="margin-top:80px;text-align:center;">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;">
          <div style="height:1px;width:40px;background:linear-gradient(to right,transparent,rgba(124,108,242,0.2));"></div>
          <div style="width:3px;height:3px;border-radius:50%;background:rgba(124,108,242,0.25);"></div>
          <div style="width:3px;height:3px;border-radius:50%;background:rgba(232,121,160,0.2);"></div>
          <div style="width:3px;height:3px;border-radius:50%;background:rgba(124,108,242,0.25);"></div>
          <div style="height:1px;width:40px;background:linear-gradient(to left,transparent,rgba(124,108,242,0.2));"></div>
        </div>
        <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:0.75rem;color:rgba(184,160,184,0.45);letter-spacing:0.15em;margin-bottom:14px;">偶像成員記録 · Idol Archive</p>
        <a routerLink="/privacy" style="font-size:0.72rem;color:rgba(122,90,122,0.4);text-decoration:none;letter-spacing:0.04em;">隱私政策</a>
      </footer>

    }
  </div>
</div>

<style>
  @keyframes spin { to { transform: rotate(360deg); } }

  .sns-link {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 10px; border-radius: 20px; border: 1px solid;
    font-family: 'Shippori Mincho', serif;
    font-size: 0.72rem; letter-spacing: 0.08em;
    text-decoration: none; transition: all 0.2s ease;
  }
  .sns-link--ig { color:#c2507a;border-color:rgba(194,80,122,0.25);background:rgba(194,80,122,0.05); }
  .sns-link--ig:hover { background:rgba(194,80,122,0.1);border-color:rgba(194,80,122,0.45); }
  .sns-link--fb { color:#3b6ec2;border-color:rgba(59,110,194,0.25);background:rgba(59,110,194,0.05); }
  .sns-link--fb:hover { background:rgba(59,110,194,0.1);border-color:rgba(59,110,194,0.45); }
  .sns-link--x { color:#2a2a2a;border-color:rgba(42,42,42,0.18);background:rgba(42,42,42,0.04); }
  .sns-link--x:hover { background:rgba(42,42,42,0.08);border-color:rgba(42,42,42,0.35); }
  .sns-link--yt { color:#dc2626;border-color:rgba(220,38,38,0.25);background:rgba(220,38,38,0.05); }
  .sns-link--yt:hover { background:rgba(220,38,38,0.1);border-color:rgba(220,38,38,0.45); }
  .sns-link--web { color:#6b7280;border-color:rgba(107,114,128,0.25);background:rgba(107,114,128,0.05); }
  .sns-link--web:hover { background:rgba(107,114,128,0.1);border-color:rgba(107,114,128,0.45); }
</style>
```

- [ ] **Step 3: Verify build**

```bash
npx ng build --configuration development 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/company-page/
git commit -m "feat: add CompanyPageComponent with banner, logo, and groups chips"
```

---

### Task 6: Add /company/:id route

**Files:**
- Modify: `src/app/app.routes.ts`

- [ ] **Step 1: Add route before the `**` wildcard**

In `src/app/app.routes.ts`, add this entry **before** `{ path: '**', redirectTo: '' }` and after the `/companies` route:

```typescript
  {
    path: 'company/:id',
    loadComponent: () => import('./pages/company-page/company-page.component').then(m => m.CompanyPageComponent)
  },
```

- [ ] **Step 2: Verify build and manual test**

```bash
npx ng build --configuration development 2>&1 | grep -E "error|Error" | head -20
```

Then run `ng serve` and navigate to `/company/any-id` — should show loading then not-found state (no companies exist yet).

- [ ] **Step 3: Commit**

```bash
git add src/app/app.routes.ts
git commit -m "feat: add /company/:id route"
```

---

## Chunk 3: Companies List Page Update

### Task 7: Update CompaniesComponent to show company cards

**Files:**
- Modify: `src/app/pages/companies/companies.component.ts`
- Modify: `src/app/pages/companies/companies.component.html`

- [ ] **Step 1: Update the TypeScript component**

Replace the full content of `src/app/pages/companies/companies.component.ts`:

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GroupService } from '../../core/group.service';
import { CompanyService } from '../../core/company.service';
import { SeoService } from '../../core/seo.service';
import { Company, Group } from '../../models';

interface LegacySection {
  name: string;
  groups: Group[];
  activeCount: number;
  disbandedCount: number;
}

@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './companies.component.html',
})
export class CompaniesComponent implements OnInit {
  companies: Company[] = [];
  legacySections: LegacySection[] = [];
  loading = true;

  constructor(
    private groupService: GroupService,
    private companyService: CompanyService,
    private seo: SeoService
  ) {}

  async ngOnInit() {
    this.seo.setPage(
      '事務所一覽 | 台灣地下偶像族譜',
      '台灣地下偶像各事務所旗下組合完整列表。',
      'https://idol-genealogy.pages.dev/companies'
    );
    try {
      const [companies, allGroups] = await Promise.all([
        this.companyService.getAll(),
        this.groupService.getAll(),
      ]);
      this.companies = companies;

      // FK-linked company names (for de-duplication)
      const linkedNames = new Set(companies.map(c => c.name.trim().toLowerCase()));

      // Legacy: groups with no company_id
      // De-duplicate: suppress legacy section if company name matches a linked company
      // Also collect independent groups (no company_id and no company string)
      const legacyMap = new Map<string, Group[]>();
      for (const g of allGroups) {
        if (g.company_id) continue; // already linked — skip
        const key = g.company?.trim() || '獨立・其他';
        if (key !== '獨立・其他' && linkedNames.has(key.toLowerCase())) continue; // suppressed
        if (!legacyMap.has(key)) legacyMap.set(key, []);
        legacyMap.get(key)!.push(g);
      }

      const entries = [...legacyMap.entries()].sort(([a, ga], [b, gb]) => {
        if (a === '獨立・其他') return 1;
        if (b === '獨立・其他') return -1;
        return gb.length - ga.length || a.localeCompare(b, 'zh-Hant');
      });

      this.legacySections = entries.map(([name, gs]) => {
        const sorted = gs.sort((a, b) => {
          const aA = !a.disbanded_at ? 0 : 1;
          const bA = !b.disbanded_at ? 0 : 1;
          if (aA !== bA) return aA - bA;
          return (b.founded_at ?? '').localeCompare(a.founded_at ?? '');
        });
        return {
          name,
          groups: sorted,
          activeCount: gs.filter(g => !g.disbanded_at).length,
          disbandedCount: gs.filter(g => !!g.disbanded_at).length,
        };
      });
    } finally {
      this.loading = false;
    }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
```

- [ ] **Step 2: Update the HTML template**

Add the company cards section at the top of the content area (before legacy sections). In `companies.component.html`, replace the `@if (!loading)` block:

```html
    <!-- Company cards (FK-linked) -->
    @if (!loading && companies.length > 0) {
      <div style="margin-top: 48px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
          <div style="height:1px;width:20px;background:rgba(124,108,242,0.45);"></div>
          <span style="
            font-family:'Shippori Mincho',serif;
            font-size:0.65rem;letter-spacing:0.38em;
            text-transform:uppercase;color:rgba(124,108,242,0.55);
          ">事務所</span>
          <div style="flex:1;height:1px;background:linear-gradient(to right,rgba(124,108,242,0.2),transparent);"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
          @for (c of companies; track c.id) {
            <a [routerLink]="['/company', c.id]" style="
              display:flex;align-items:center;gap:12px;
              padding:14px 16px;
              background:rgba(255,255,255,0.75);
              backdrop-filter:blur(8px);
              border:1px solid rgba(255,255,255,0.9);
              border-radius:10px;
              box-shadow:0 2px 12px rgba(45,27,46,0.05);
              text-decoration:none;
              transition:box-shadow 0.2s,transform 0.2s;
            ">
              @if (c.photo_url) {
                <img [src]="c.photo_url" [alt]="c.name"
                  style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid white;"/>
              } @else {
                <div style="
                  width:36px;height:36px;border-radius:50%;flex-shrink:0;
                  display:flex;align-items:center;justify-content:center;
                  font-family:'Cormorant Garamond',serif;font-size:1.1rem;font-weight:500;
                  color:white;border:2px solid white;
                " [style.background]="c.color || '#7c6cf2'">{{ getInitial(c.name) }}</div>
              }
              <div style="min-width:0;flex:1;">
                <div style="
                  font-family:'Shippori Mincho',serif;
                  font-size:0.88rem;color:#2d1b2e;font-weight:500;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                ">{{ c.name }}</div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(124,108,242,0.4)" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </a>
          }
        </div>
      </div>
    }

    <!-- Legacy sections -->
    @if (!loading && legacySections.length > 0) {
      <div style="margin-top: 56px; display:flex;flex-direction:column;gap:48px;">
        <!-- (keep existing section markup, just change `sections` to `legacySections`) -->
```

Replace `@for (section of sections` with `@for (section of legacySections` in the existing section loop, and wrap it in the div above.

- [ ] **Step 3: Verify build and manual test**

```bash
npx ng build --configuration development 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/companies/
git commit -m "feat: update CompaniesComponent to show FK-linked company cards"
```

---

## Chunk 4: Admin Companies

### Task 8: Create AdminCompaniesComponent

**Files:**
- Create: `src/app/pages/admin/admin-companies/admin-companies.component.ts`
- Create: `src/app/pages/admin/admin-companies/admin-companies.component.html`

- [ ] **Step 1: Write the TypeScript component**

```typescript
// src/app/pages/admin/admin-companies/admin-companies.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyService } from '../../../core/company.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { Company } from '../../../models';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-companies',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-companies.component.html',
})
export class AdminCompaniesComponent implements OnInit, OnDestroy {
  companies: Company[] = [];
  groupCounts: Record<string, number> = {};
  loading = true;
  showModal = false;
  editing: Partial<Company> = {};
  isEdit = false;
  saving = false;
  error = '';
  isAdmin = false;
  fetchingIg = false;
  igFetchError = '';
  private _sub: Subscription;

  constructor(
    private companyService: CompanyService,
    private adminRole: AdminRoleService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy() { this._sub.unsubscribe(); }

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    try {
      [this.companies, this.groupCounts] = await Promise.all([
        this.companyService.getAll(),
        this.companyService.getGroupCounts(),
      ]);
    } finally {
      this.loading = false;
    }
  }

  openCreate() {
    this.editing = {};
    this.isEdit = false;
    this.error = '';
    this.igFetchError = '';
    this.showModal = true;
  }

  openEdit(c: Company) {
    this.editing = { ...c };
    this.isEdit = true;
    this.error = '';
    this.igFetchError = '';
    this.showModal = true;
  }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '公司名稱為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.companyService.update(this.editing.id, this.editing);
      } else {
        await this.companyService.create(this.editing);
      }
      this.showModal = false;
      await this.load();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(c: Company) {
    if (!confirm(`確定刪除「${c.name}」？刪除後旗下組合的公司關聯將清除。`)) return;
    try {
      await this.companyService.delete(c.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '刪除失敗');
    }
  }

  extractIgUsername(igUrl: string): string | null {
    const match = igUrl.match(/instagram\.com\/([^/?#\s]+)/);
    return match?.[1] ?? null;
  }

  async fetchIgPhoto() {
    const igUrl = this.editing.instagram;
    if (!igUrl) return;
    const username = this.extractIgUsername(igUrl);
    if (!username) { this.igFetchError = '無法解析 Instagram 帳號'; return; }
    this.fetchingIg = true;
    this.igFetchError = '';
    try {
      const res = await fetch(
        `${environment.supabaseUrl}/functions/v1/ig-photo?username=${encodeURIComponent(username)}`
      );
      const json = await res.json();
      if (json.photo_url) {
        this.editing.photo_url = json.photo_url;
      } else {
        this.igFetchError = json.hint ?? json.error ?? '抓取失敗';
      }
    } catch (e: any) {
      this.igFetchError = e.message || '網路錯誤';
    } finally { this.fetchingIg = false; }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
```

- [ ] **Step 2: Write the HTML template**

```html
<!-- src/app/pages/admin/admin-companies/admin-companies.component.html -->
<div class="p-8">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-semibold text-gray-800">公司管理</h1>
    <button (click)="openCreate()"
      class="px-4 py-2 bg-purple-500 text-white text-sm rounded-md hover:bg-purple-600 transition-colors">
      + 新增公司
    </button>
  </div>

  <div *ngIf="loading" class="text-center py-16 text-gray-400">載入中…</div>
  <div *ngIf="!loading && companies.length === 0" class="text-center py-16 text-gray-400">尚無公司資料</div>

  <div *ngIf="!loading && companies.length > 0" class="bg-white rounded-lg shadow-sm overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-gray-50 border-b border-gray-200">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">頭像</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名稱</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">簡介</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">旗下組合數</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">操作</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        <tr *ngFor="let c of companies" class="hover:bg-gray-50 transition-colors">
          <td class="px-4 py-3">
            <img *ngIf="c.photo_url" [src]="c.photo_url" [alt]="c.name"
              class="w-8 h-8 rounded-full object-cover"/>
            <div *ngIf="!c.photo_url"
              class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white"
              [style.background]="c.color || '#7c6cf2'">
              {{ getInitial(c.name) }}
            </div>
          </td>
          <td class="px-4 py-3 font-medium text-gray-800">{{ c.name }}</td>
          <td class="px-4 py-3 text-gray-500 max-w-xs truncate">{{ c.description || '—' }}</td>
          <td class="px-4 py-3 text-gray-500 text-center">{{ groupCounts[c.id] ?? 0 }}</td>
          <td class="px-4 py-3 text-right space-x-2">
            <button (click)="openEdit(c)"
              class="text-xs px-2 py-1 rounded text-purple-600 hover:bg-purple-50 transition-colors">
              編輯
            </button>
            <button *ngIf="isAdmin" (click)="delete(c)"
              class="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50 transition-colors">
              刪除
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- Modal -->
<div *ngIf="showModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-lg font-semibold text-gray-800">{{ isEdit ? '編輯公司' : '新增公司' }}</h2>
      <button (click)="showModal = false" class="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="space-y-4">
      <!-- Name -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">公司名稱 <span class="text-red-400">*</span></label>
        <input type="text" [(ngModel)]="editing.name" placeholder="公司／事務所名稱"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
      </div>

      <!-- photo_url + IG fetch -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">頭像 URL</label>
        <div class="flex gap-2">
          <input type="url" [(ngModel)]="editing.photo_url" placeholder="https://..."
            class="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
          <button type="button" (click)="fetchIgPhoto()"
            [disabled]="!editing.instagram || fetchingIg"
            class="flex-shrink-0 px-3 py-2 rounded-md border border-gray-200 text-pink-400 hover:bg-pink-50 hover:border-pink-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="2" y="2" width="20" height="20" rx="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"/>
            </svg>
            {{ fetchingIg ? '抓取中…' : '從 IG 抓取' }}
          </button>
        </div>
        <p *ngIf="igFetchError" class="text-xs text-red-400 mt-1">{{ igFetchError }}</p>
      </div>

      <!-- Color -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">代表色</label>
        <div class="flex items-center gap-3">
          <input type="color" [(ngModel)]="editing.color"
            class="w-10 h-10 rounded border border-gray-200 cursor-pointer p-0.5"/>
          <input type="text" [(ngModel)]="editing.color" placeholder="#7c6cf2"
            class="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-300"/>
        </div>
      </div>

      <!-- Description -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">簡介</label>
        <textarea [(ngModel)]="editing.description" rows="3" placeholder="公司簡介…"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"></textarea>
      </div>

      <!-- Website -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">官網</label>
        <input type="url" [(ngModel)]="editing.website" placeholder="https://..."
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
      </div>

      <!-- Instagram -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-pink-400">
            <rect x="2" y="2" width="20" height="20" rx="5"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"/>
          </svg>
          Instagram
        </label>
        <input type="url" [(ngModel)]="editing.instagram" placeholder="https://instagram.com/..."
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
      </div>

      <!-- Facebook -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-blue-400">
            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
          </svg>
          Facebook
        </label>
        <input type="url" [(ngModel)]="editing.facebook" placeholder="https://facebook.com/..."
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
      </div>

      <!-- X -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" class="text-gray-600">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          X (Twitter)
        </label>
        <input type="url" [(ngModel)]="editing.x" placeholder="https://x.com/..."
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
      </div>

      <!-- YouTube -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" class="text-red-500">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          YouTube
        </label>
        <input type="url" [(ngModel)]="editing.youtube" placeholder="https://youtube.com/..."
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
      </div>

      <!-- Founded -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">成立日期</label>
        <input type="date" [(ngModel)]="editing.founded_at"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
      </div>

      <p *ngIf="error" class="text-xs text-red-500">{{ error }}</p>
    </div>

    <div class="flex justify-end gap-3 mt-6">
      <button (click)="showModal = false"
        class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">取消</button>
      <button (click)="save()" [disabled]="saving"
        class="px-4 py-2 bg-purple-500 text-white text-sm rounded-md hover:bg-purple-600 disabled:opacity-50 transition-colors">
        {{ saving ? '儲存中…' : '儲存' }}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Verify build**

```bash
npx ng build --configuration development 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/admin/admin-companies/
git commit -m "feat: add AdminCompaniesComponent with CRUD and IG photo fetch"
```

---

### Task 9: Add admin route + shell nav link

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/pages/admin/admin-shell/admin-shell.component.html`

- [ ] **Step 1: Add /admin/companies child route**

In `src/app/app.routes.ts`, inside the `admin` children array (before the `''` redirect), add:

```typescript
{ path: 'companies', loadComponent: () => import('./pages/admin/admin-companies/admin-companies.component').then(m => m.AdminCompaniesComponent) },
```

- [ ] **Step 2: Add nav link in admin shell**

In `admin-shell.component.html`, add after the `組合管理` link:

```html
      <a
        routerLink="/admin/companies"
        routerLinkActive="bg-pink-100 text-pink-700 font-medium"
        class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors"
      >
        公司管理
      </a>
```

- [ ] **Step 3: Verify build and manual test**

```bash
npx ng build --configuration development 2>&1 | grep -E "error|Error" | head -20
```

Start `ng serve`, go to `/admin/companies` — should see the empty table with "+ 新增公司" button. Try creating a company.

- [ ] **Step 4: Commit**

```bash
git add src/app/app.routes.ts src/app/pages/admin/admin-shell/admin-shell.component.html
git commit -m "feat: add /admin/companies route and sidebar nav link"
```

---

## Chunk 5: Admin Groups — Company Dropdown

### Task 10: Update AdminGroupsComponent with company dropdown

**Files:**
- Modify: `src/app/pages/admin/admin-groups/admin-groups.component.ts`
- Modify: `src/app/pages/admin/admin-groups/admin-groups.component.html`

- [ ] **Step 1: Update the TypeScript component**

Add `CompanyService` import and inject it. Load companies on modal open.

Add to imports at the top:

```typescript
import { CompanyService } from '../../../core/company.service';
import { Company } from '../../../models';
```

Add to the class body (after existing fields):

```typescript
  companies: Company[] = [];
```

Inject in constructor:

```typescript
  constructor(
    private groupService: GroupService,
    private adminRole: AdminRoleService,
    private companyService: CompanyService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }
```

Update `openCreate()` and `openEdit()` to load companies:

```typescript
  openCreate() {
    this.editing = { color: '#e879a0' };
    this.isEdit = false;
    this.error = '';
    this.igFetchError = '';
    this.videos = [];
    this.newVideoUrl = '';
    this.videoError = '';
    this.showModal = true;
    this.loadCompanies();
  }

  async openEdit(g: Group) {
    this.editing = { ...g };
    this.isEdit = true;
    this.error = '';
    this.igFetchError = '';
    this.newVideoUrl = '';
    this.videoError = '';
    this.showModal = true;
    this.videos = await this.groupService.getVideosByGroup(g.id);
    this.loadCompanies();
  }

  private async loadCompanies() {
    try {
      this.companies = await this.companyService.getAll();
    } catch { this.companies = []; }
  }
```

- [ ] **Step 2: Update the HTML — replace company text input with dropdown + keep legacy field**

In `admin-groups.component.html`, find and replace this exact block (the `<!-- company -->` section):

```html
      <!-- company -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">所屬事務所</label>
        <input
          type="text"
          [(ngModel)]="editing.company"
          placeholder="例：Toypla、Shining Star Project"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent"
        />
      </div>
```

Replace with:

```html
      <!-- company_id dropdown -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">所屬事務所（公司頁面）</label>
        <select [(ngModel)]="editing.company_id"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
          <option [ngValue]="null">— 無 —</option>
          <option *ngFor="let c of companies" [ngValue]="c.id">{{ c.name }}</option>
        </select>
      </div>

      <!-- legacy company text (fallback for unlinked groups) -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">自定義事務所名稱（若未建立公司頁）</label>
        <input type="text" [(ngModel)]="editing.company"
          placeholder="例：Toypla"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
      </div>
```

- [ ] **Step 3: Verify build**

```bash
npx ng build --configuration development 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 4: Manual test**

`ng serve` → go to `/admin/groups` → edit a group → confirm the company dropdown shows the companies you created in Task 9. Select one and save. Verify the group's `company_id` is saved in Supabase.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/admin/admin-groups/
git commit -m "feat: add company_id dropdown to admin groups modal"
```

---

## Final Verification

- [ ] Create a company in `/admin/companies` (with logo, color, description, SNS)
- [ ] Link a group to the company via `/admin/groups` dropdown
- [ ] Visit `/company/<id>` — confirm banner color, logo, group chips show correctly
- [ ] Visit `/companies` — confirm the company appears as a card at the top, linked group no longer appears in legacy section
- [ ] Confirm 獨立・其他 section still appears for groups with no company association
- [ ] Confirm clicking a company chip on the group page → navigates to company page (if you add a company_id link there — note: group page currently does not show company link; that is out of scope for this plan)
- [ ] Final commit if any fixes needed

```bash
git add -A
git commit -m "feat: companies feature — complete"
```
