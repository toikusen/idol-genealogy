# Wanted Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增公開頁面 `/wanted`，顯示哪些成員、團體、公司缺少資料，並引導粉絲直接提案補充。

**Architecture:** 前端從 Supabase 取得全量資料後在 client 端計算完整度，不需新增後端邏輯。頁面由一個 standalone Angular component 組成，包含頂部統計摘要、頭像圓圈矩陣概覽（邊框顏色代表完整度）、Tab 切換的卡片列表。「補充資料」按鈕帶 `?propose=true` query param，各條目頁面偵測後自動開啟 proposal panel。

**Tech Stack:** Angular 17 standalone components, Supabase, Tailwind CSS, Jasmine/Karma

---

## File Map

### New Files
- `src/app/core/completeness.utils.ts` — 計算成員/團體/公司完整度的純函式
- `src/app/core/completeness.utils.spec.ts` — 完整度工具測試
- `src/app/pages/wanted/wanted.component.ts` — 頁面 component logic
- `src/app/pages/wanted/wanted.component.html` — 頁面模板

### Modified Files
- `src/app/app.routes.ts` — 新增 `/wanted` 路由
- `src/app/pages/home/home.component.html` — 在 footer 加入 `/wanted` 連結
- `src/app/pages/member-page/member-page.component.ts` — 偵測 `?propose=true` 開啟 proposal panel
- `src/app/pages/group-page/group-page.component.ts` — 同上（`showGroupProposalPanel`）
- `src/app/pages/company-page/company-page.component.ts` — 同上（`showProposalPanel`）

---

## Task 1: Completeness utility

**Files:**
- Create: `src/app/core/completeness.utils.ts`
- Create: `src/app/core/completeness.utils.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/app/core/completeness.utils.spec.ts
import { getMemberCompleteness, getGroupCompleteness, getCompanyCompleteness } from './completeness.utils';
import { Member, Group, Company } from '../models';

const baseMember: Member = {
  id: '1', name: '測試', name_roman: null, photo_url: null, color: null,
  color_name: null, birthdate: null, nickname: null, instagram: null,
  facebook: null, x: null, maid_url: null, notes: null, company_id: null,
  updated_at: '', created_at: '',
};

describe('getMemberCompleteness', () => {
  it('returns score 0 and all core missing when all fields null', () => {
    const result = getMemberCompleteness(baseMember);
    expect(result.score).toBe(0);
    expect(result.isComplete).toBeFalse();
    expect(result.missingCoreLabels).toContain('頭像');
    expect(result.missingCoreLabels).toContain('生日');
    expect(result.missingCoreLabels).toContain('英文/拼音名');
    expect(result.missingCoreLabels).toContain('社群帳號');
  });

  it('returns isComplete true when all core fields present', () => {
    const full: Member = { ...baseMember, photo_url: 'url', birthdate: '01-01', name_roman: 'Test', instagram: 'test' };
    const result = getMemberCompleteness(full);
    expect(result.isComplete).toBeTrue();
    expect(result.missingCoreLabels).toEqual([]);
  });

  it('treats having any one social as social requirement met', () => {
    const m: Member = { ...baseMember, facebook: 'fb' };
    const result = getMemberCompleteness(m);
    expect(result.missingCoreLabels).not.toContain('社群帳號');
  });

  it('returns score 100 when all tracked fields present', () => {
    const full: Member = {
      ...baseMember,
      photo_url: 'url', birthdate: '01-01', name_roman: 'Test',
      instagram: 'ig', nickname: 'nick', color: '#fff', color_name: '白',
    };
    expect(getMemberCompleteness(full).score).toBe(100);
  });

  it('returns partial score proportional to filled fields', () => {
    // 7 tracked fields: photo_url, birthdate, name_roman, hasSocial, nickname, color, color_name
    // fill 4 of 7 → ~57%
    const m: Member = { ...baseMember, photo_url: 'url', birthdate: '01-01', name_roman: 'Test', instagram: 'ig' };
    const result = getMemberCompleteness(m);
    expect(result.score).toBe(Math.round(4 / 7 * 100));
  });
});

const baseGroup: Group = {
  id: '1', name: '測試團', name_jp: null, photo_url: null, color: '#fff',
  company: null, company_id: null, founded_at: null, disbanded_at: null,
  notes: null, style: null, instagram: null, facebook: null, x: null,
  youtube: null, updated_at: '', created_at: '',
};

describe('getGroupCompleteness', () => {
  it('returns isComplete false when all null', () => {
    expect(getGroupCompleteness(baseGroup).isComplete).toBeFalse();
  });

  it('returns isComplete true when all core fields present', () => {
    const full: Group = { ...baseGroup, photo_url: 'url', founded_at: '2020-01-01', name_jp: '日文名', youtube: 'yt' };
    expect(getGroupCompleteness(full).isComplete).toBeTrue();
  });
});

const baseCompany: Company = {
  id: '1', name: '測試公司', description: null, photo_url: null,
  color: null, instagram: null, facebook: null, x: null, youtube: null,
  website: null, founded_at: null, created_at: '', updated_at: '',
};

describe('getCompanyCompleteness', () => {
  it('returns isComplete false when all null', () => {
    expect(getCompanyCompleteness(baseCompany).isComplete).toBeFalse();
  });

  it('returns isComplete true when all core fields present', () => {
    const full: Company = { ...baseCompany, photo_url: 'url', website: 'https://example.com', instagram: 'ig' };
    expect(getCompanyCompleteness(full).isComplete).toBeTrue();
  });

  it('returns score 100 when all tracked fields present', () => {
    const full: Company = { ...baseCompany, photo_url: 'url', website: 'https://x.com', instagram: 'ig', description: '說明' };
    expect(getCompanyCompleteness(full).score).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/seitumbp2025/idol-genealogy && ng test --no-watch 2>&1 | grep -A2 "completeness"
```

Expected: compile error — `completeness.utils` not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/app/core/completeness.utils.ts
import { Member, Group, Company } from '../models';

export interface CompletenessResult {
  score: number;           // 0–100 integer
  missingCoreLabels: string[];  // display labels of missing core fields
  isComplete: boolean;     // true when all core fields present
}

function pct(filled: number, total: number): number {
  return Math.round(filled / total * 100);
}

export function getMemberCompleteness(m: Member): CompletenessResult {
  const hasSocial = !!(m.instagram || m.facebook || m.x);

  const coreChecks: [boolean, string][] = [
    [!!m.photo_url,    '頭像'],
    [!!m.birthdate,    '生日'],
    [!!m.name_roman,   '英文/拼音名'],
    [hasSocial,        '社群帳號'],
  ];

  const optionalChecks: boolean[] = [
    !!m.nickname,
    !!m.color,
    !!m.color_name,
  ];

  const missingCoreLabels = coreChecks.filter(([ok]) => !ok).map(([, label]) => label);
  const coreFilledCount = coreChecks.filter(([ok]) => ok).length;
  const optFilledCount = optionalChecks.filter(Boolean).length;
  const total = coreChecks.length + optionalChecks.length; // 7

  return {
    score: pct(coreFilledCount + optFilledCount, total),
    missingCoreLabels,
    isComplete: missingCoreLabels.length === 0,
  };
}

export function getGroupCompleteness(g: Group): CompletenessResult {
  const hasSocial = !!(g.instagram || g.facebook || g.x || g.youtube);

  const coreChecks: [boolean, string][] = [
    [!!g.photo_url,    '頭像'],
    [!!g.founded_at,   '成立日期'],
    [!!g.name_jp,      '日文名稱'],
    [hasSocial,        '社群帳號'],
  ];

  const optionalChecks: boolean[] = [
    !!g.style,
    !!g.disbanded_at,
  ];

  const missingCoreLabels = coreChecks.filter(([ok]) => !ok).map(([, label]) => label);
  const coreFilledCount = coreChecks.filter(([ok]) => ok).length;
  const optFilledCount = optionalChecks.filter(Boolean).length;
  const total = coreChecks.length + optionalChecks.length; // 6

  return {
    score: pct(coreFilledCount + optFilledCount, total),
    missingCoreLabels,
    isComplete: missingCoreLabels.length === 0,
  };
}

export function getCompanyCompleteness(c: Company): CompletenessResult {
  const hasSocial = !!(c.instagram || c.facebook || c.x || c.youtube);

  const coreChecks: [boolean, string][] = [
    [!!c.photo_url,  '頭像'],
    [!!c.website,    '官網'],
    [hasSocial,      '社群帳號'],
  ];

  const optionalChecks: boolean[] = [
    !!c.description,
  ];

  const missingCoreLabels = coreChecks.filter(([ok]) => !ok).map(([, label]) => label);
  const coreFilledCount = coreChecks.filter(([ok]) => ok).length;
  const optFilledCount = optionalChecks.filter(Boolean).length;
  const total = coreChecks.length + optionalChecks.length; // 4

  return {
    score: pct(coreFilledCount + optFilledCount, total),
    missingCoreLabels,
    isComplete: missingCoreLabels.length === 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/seitumbp2025/idol-genealogy && ng test --no-watch 2>&1 | grep -A2 "completeness\|FAILED\|SUCCESS"
```

Expected: all completeness tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/completeness.utils.ts src/app/core/completeness.utils.spec.ts
git commit -m "✨ feat(wanted): add completeness utility for members/groups/companies"
```

---

## Task 2: WantedPageComponent

**Files:**
- Create: `src/app/pages/wanted/wanted.component.ts`
- Create: `src/app/pages/wanted/wanted.component.html`

- [ ] **Step 1: Create component TS**

```typescript
// src/app/pages/wanted/wanted.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { CompanyService } from '../../core/company.service';
import { SeoService } from '../../core/seo.service';
import { Member, Group, Company } from '../../models';
import {
  getMemberCompleteness,
  getGroupCompleteness,
  getCompanyCompleteness,
  CompletenessResult,
} from '../../core/completeness.utils';

export interface WantedMember {
  member: Member;
  completeness: CompletenessResult;
}

export interface WantedGroup {
  group: Group;
  completeness: CompletenessResult;
}

export interface WantedCompany {
  company: Company;
  completeness: CompletenessResult;
}

@Component({
  selector: 'app-wanted',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './wanted.component.html',
})
export class WantedComponent implements OnInit {
  loading = true;
  error = false;
  activeTab: 'members' | 'groups' | 'companies' = 'members';

  wantedMembers: WantedMember[] = [];
  wantedGroups: WantedGroup[] = [];
  wantedCompanies: WantedCompany[] = [];

  totalMembers = 0;
  totalGroups = 0;
  totalCompanies = 0;

  constructor(
    private memberService: MemberService,
    private groupService: GroupService,
    private companyService: CompanyService,
    private seo: SeoService,
  ) {}

  async ngOnInit() {
    this.seo.setPage(
      '資料待補充 - Idol Maps',
      '查看哪些成員、團體、公司缺少資料，並幫助補充完整。',
    );

    try {
      const [members, groups, companies] = await Promise.all([
        this.memberService.getAll(),
        this.groupService.getAll(),
        this.companyService.getAll(),
      ]);

      this.totalMembers = members.length;
      this.totalGroups = groups.length;
      this.totalCompanies = companies.length;

      this.wantedMembers = members
        .map(member => ({ member, completeness: getMemberCompleteness(member) }))
        .filter(e => !e.completeness.isComplete)
        .sort((a, b) => a.completeness.score - b.completeness.score);

      this.wantedGroups = groups
        .map(group => ({ group, completeness: getGroupCompleteness(group) }))
        .filter(e => !e.completeness.isComplete)
        .sort((a, b) => a.completeness.score - b.completeness.score);

      this.wantedCompanies = companies
        .map(company => ({ company, completeness: getCompanyCompleteness(company) }))
        .filter(e => !e.completeness.isComplete)
        .sort((a, b) => a.completeness.score - b.completeness.score);
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  borderClass(score: number): string {
    return score < 50 ? 'border-red-400' : 'border-yellow-400';
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
```

- [ ] **Step 2: Create component HTML**

```html
<!-- src/app/pages/wanted/wanted.component.html -->
<div class="min-h-screen" style="background: var(--bg-primary); color: var(--text-primary);">
  <div class="max-w-4xl mx-auto px-4 py-10">

    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold mb-1" style="color: var(--text-primary);">資料待補充</h1>
      <p class="text-sm" style="color: var(--text-secondary);">以下條目缺少重要資料，歡迎提案補充。</p>
    </div>

    @if (loading) {
      <div class="text-center py-20" style="color: var(--text-secondary);">載入中…</div>
    } @else if (error) {
      <div class="text-center py-20 text-red-400">載入失敗，請稍後再試。</div>
    } @else {

      <!-- Summary bar -->
      <div class="flex flex-wrap gap-4 mb-8 text-sm" style="color: var(--text-secondary);">
        <span>成員 <strong style="color: var(--text-primary);">{{ wantedMembers.length }}</strong> / {{ totalMembers }} 不完整</span>
        <span style="opacity: 0.3;">·</span>
        <span>團體 <strong style="color: var(--text-primary);">{{ wantedGroups.length }}</strong> / {{ totalGroups }} 不完整</span>
        <span style="opacity: 0.3;">·</span>
        <span>公司 <strong style="color: var(--text-primary);">{{ wantedCompanies.length }}</strong> / {{ totalCompanies }} 不完整</span>
      </div>

      <!-- Avatar grid overview -->
      <div class="mb-8">
        <p class="text-xs mb-3" style="color: var(--text-secondary);">
          <span class="inline-block w-2.5 h-2.5 rounded-full border-2 border-red-400 mr-1"></span>完整度 &lt; 50%
          <span class="inline-block w-2.5 h-2.5 rounded-full border-2 border-yellow-400 ml-3 mr-1"></span>完整度 50–80%
        </p>
        <div class="flex flex-wrap gap-2">
          @for (entry of wantedMembers; track entry.member.id) {
            <a [routerLink]="['/member', entry.member.id]"
               [title]="entry.member.name"
               class="block w-10 h-10 rounded-full border-2 overflow-hidden flex-shrink-0 transition-transform hover:scale-110"
               [class]="borderClass(entry.completeness.score)">
              @if (entry.member.photo_url) {
                <img [src]="entry.member.photo_url" [alt]="entry.member.name" class="w-full h-full object-cover" loading="lazy">
              } @else {
                <div class="w-full h-full flex items-center justify-center text-xs font-bold"
                     style="background: rgba(124,108,242,0.1); color: rgba(124,108,242,0.7);">
                  {{ getInitial(entry.member.name) }}
                </div>
              }
            </a>
          }
          @for (entry of wantedGroups; track entry.group.id) {
            <a [routerLink]="['/group', entry.group.id]"
               [title]="entry.group.name"
               class="block w-10 h-10 rounded-full border-2 overflow-hidden flex-shrink-0 transition-transform hover:scale-110"
               [class]="borderClass(entry.completeness.score)">
              @if (entry.group.photo_url) {
                <img [src]="entry.group.photo_url" [alt]="entry.group.name" class="w-full h-full object-cover" loading="lazy">
              } @else {
                <div class="w-full h-full flex items-center justify-center text-xs font-bold"
                     style="background: rgba(124,108,242,0.1); color: rgba(124,108,242,0.7);">
                  {{ getInitial(entry.group.name) }}
                </div>
              }
            </a>
          }
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 border-b" style="border-color: rgba(124,108,242,0.15);">
        <button
          (click)="activeTab = 'members'"
          class="px-4 py-2 text-sm font-medium transition-colors"
          [style]="activeTab === 'members'
            ? 'color: rgba(124,108,242,1); border-bottom: 2px solid rgba(124,108,242,0.8); margin-bottom: -1px;'
            : 'color: var(--text-secondary);'">
          成員 ({{ wantedMembers.length }})
        </button>
        <button
          (click)="activeTab = 'groups'"
          class="px-4 py-2 text-sm font-medium transition-colors"
          [style]="activeTab === 'groups'
            ? 'color: rgba(124,108,242,1); border-bottom: 2px solid rgba(124,108,242,0.8); margin-bottom: -1px;'
            : 'color: var(--text-secondary);'">
          團體 ({{ wantedGroups.length }})
        </button>
        <button
          (click)="activeTab = 'companies'"
          class="px-4 py-2 text-sm font-medium transition-colors"
          [style]="activeTab === 'companies'
            ? 'color: rgba(124,108,242,1); border-bottom: 2px solid rgba(124,108,242,0.8); margin-bottom: -1px;'
            : 'color: var(--text-secondary);'">
          公司 ({{ wantedCompanies.length }})
        </button>
      </div>

      <!-- Member list -->
      @if (activeTab === 'members') {
        @if (wantedMembers.length === 0) {
          <p class="text-center py-12" style="color: var(--text-secondary);">所有成員資料均已完整！</p>
        }
        <div class="space-y-3">
          @for (entry of wantedMembers; track entry.member.id) {
            <div class="flex items-center gap-4 rounded-xl px-4 py-3"
                 style="background: var(--card-bg, rgba(255,255,255,0.04)); border: 1px solid rgba(124,108,242,0.1);">
              <!-- Avatar -->
              <a [routerLink]="['/member', entry.member.id]"
                 class="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2"
                 [class]="borderClass(entry.completeness.score)">
                @if (entry.member.photo_url) {
                  <img [src]="entry.member.photo_url" [alt]="entry.member.name" class="w-full h-full object-cover" loading="lazy">
                } @else {
                  <div class="w-full h-full flex items-center justify-center font-bold"
                       style="background: rgba(124,108,242,0.1); color: rgba(124,108,242,0.7);">
                    {{ getInitial(entry.member.name) }}
                  </div>
                }
              </a>
              <!-- Info -->
              <div class="flex-1 min-w-0">
                <a [routerLink]="['/member', entry.member.id]"
                   class="font-medium hover:underline truncate block"
                   style="color: var(--text-primary);">{{ entry.member.name }}</a>
                <div class="flex flex-wrap gap-1 mt-1">
                  @for (label of entry.completeness.missingCoreLabels; track label) {
                    <span class="text-xs px-1.5 py-0.5 rounded"
                          style="background: rgba(239,68,68,0.1); color: rgba(239,68,68,0.8);">缺{{ label }}</span>
                  }
                </div>
                <!-- Progress bar -->
                <div class="mt-2 flex items-center gap-2">
                  <div class="flex-1 h-1.5 rounded-full" style="background: rgba(124,108,242,0.1);">
                    <div class="h-full rounded-full transition-all"
                         [style.width.%]="entry.completeness.score"
                         [style.background]="entry.completeness.score < 50 ? 'rgba(239,68,68,0.7)' : 'rgba(234,179,8,0.7)'">
                    </div>
                  </div>
                  <span class="text-xs flex-shrink-0" style="color: var(--text-secondary);">{{ entry.completeness.score }}%</span>
                </div>
              </div>
              <!-- CTA -->
              <a [routerLink]="['/member', entry.member.id]"
                 [queryParams]="{ propose: 'true' }"
                 class="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80"
                 style="background: rgba(124,108,242,0.15); color: rgba(124,108,242,0.9);">
                補充資料
              </a>
            </div>
          }
        </div>
      }

      <!-- Group list -->
      @if (activeTab === 'groups') {
        @if (wantedGroups.length === 0) {
          <p class="text-center py-12" style="color: var(--text-secondary);">所有團體資料均已完整！</p>
        }
        <div class="space-y-3">
          @for (entry of wantedGroups; track entry.group.id) {
            <div class="flex items-center gap-4 rounded-xl px-4 py-3"
                 style="background: var(--card-bg, rgba(255,255,255,0.04)); border: 1px solid rgba(124,108,242,0.1);">
              <a [routerLink]="['/group', entry.group.id]"
                 class="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2"
                 [class]="borderClass(entry.completeness.score)">
                @if (entry.group.photo_url) {
                  <img [src]="entry.group.photo_url" [alt]="entry.group.name" class="w-full h-full object-cover" loading="lazy">
                } @else {
                  <div class="w-full h-full flex items-center justify-center font-bold"
                       style="background: rgba(124,108,242,0.1); color: rgba(124,108,242,0.7);">
                    {{ getInitial(entry.group.name) }}
                  </div>
                }
              </a>
              <div class="flex-1 min-w-0">
                <a [routerLink]="['/group', entry.group.id]"
                   class="font-medium hover:underline truncate block"
                   style="color: var(--text-primary);">{{ entry.group.name }}</a>
                <div class="flex flex-wrap gap-1 mt-1">
                  @for (label of entry.completeness.missingCoreLabels; track label) {
                    <span class="text-xs px-1.5 py-0.5 rounded"
                          style="background: rgba(239,68,68,0.1); color: rgba(239,68,68,0.8);">缺{{ label }}</span>
                  }
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <div class="flex-1 h-1.5 rounded-full" style="background: rgba(124,108,242,0.1);">
                    <div class="h-full rounded-full transition-all"
                         [style.width.%]="entry.completeness.score"
                         [style.background]="entry.completeness.score < 50 ? 'rgba(239,68,68,0.7)' : 'rgba(234,179,8,0.7)'">
                    </div>
                  </div>
                  <span class="text-xs flex-shrink-0" style="color: var(--text-secondary);">{{ entry.completeness.score }}%</span>
                </div>
              </div>
              <a [routerLink]="['/group', entry.group.id]"
                 [queryParams]="{ propose: 'true' }"
                 class="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80"
                 style="background: rgba(124,108,242,0.15); color: rgba(124,108,242,0.9);">
                補充資料
              </a>
            </div>
          }
        </div>
      }

      <!-- Company list -->
      @if (activeTab === 'companies') {
        @if (wantedCompanies.length === 0) {
          <p class="text-center py-12" style="color: var(--text-secondary);">所有公司資料均已完整！</p>
        }
        <div class="space-y-3">
          @for (entry of wantedCompanies; track entry.company.id) {
            <div class="flex items-center gap-4 rounded-xl px-4 py-3"
                 style="background: var(--card-bg, rgba(255,255,255,0.04)); border: 1px solid rgba(124,108,242,0.1);">
              <a [routerLink]="['/company', entry.company.id]"
                 class="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2"
                 [class]="borderClass(entry.completeness.score)">
                @if (entry.company.photo_url) {
                  <img [src]="entry.company.photo_url" [alt]="entry.company.name" class="w-full h-full object-cover" loading="lazy">
                } @else {
                  <div class="w-full h-full flex items-center justify-center font-bold"
                       style="background: rgba(124,108,242,0.1); color: rgba(124,108,242,0.7);">
                    {{ getInitial(entry.company.name) }}
                  </div>
                }
              </a>
              <div class="flex-1 min-w-0">
                <a [routerLink]="['/company', entry.company.id]"
                   class="font-medium hover:underline truncate block"
                   style="color: var(--text-primary);">{{ entry.company.name }}</a>
                <div class="flex flex-wrap gap-1 mt-1">
                  @for (label of entry.completeness.missingCoreLabels; track label) {
                    <span class="text-xs px-1.5 py-0.5 rounded"
                          style="background: rgba(239,68,68,0.1); color: rgba(239,68,68,0.8);">缺{{ label }}</span>
                  }
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <div class="flex-1 h-1.5 rounded-full" style="background: rgba(124,108,242,0.1);">
                    <div class="h-full rounded-full transition-all"
                         [style.width.%]="entry.completeness.score"
                         [style.background]="entry.completeness.score < 50 ? 'rgba(239,68,68,0.7)' : 'rgba(234,179,8,0.7)'">
                    </div>
                  </div>
                  <span class="text-xs flex-shrink-0" style="color: var(--text-secondary);">{{ entry.completeness.score }}%</span>
                </div>
              </div>
              <a [routerLink]="['/company', entry.company.id]"
                 [queryParams]="{ propose: 'true' }"
                 class="flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80"
                 style="background: rgba(124,108,242,0.15); color: rgba(124,108,242,0.9);">
                補充資料
              </a>
            </div>
          }
        </div>
      }

    }
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/wanted/
git commit -m "✨ feat(wanted): add WantedPageComponent with grid and list views"
```

---

## Task 3: Route + navigation link

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/pages/home/home.component.html`

- [ ] **Step 1: Add route to app.routes.ts**

In `src/app/app.routes.ts`, add before the final wildcard `{ path: '**', redirectTo: '' }`:

```typescript
{
  path: 'wanted',
  loadComponent: () => import('./pages/wanted/wanted.component').then(m => m.WantedComponent)
},
```

- [ ] **Step 2: Add footer link to home.component.html**

In `src/app/pages/home/home.component.html`, find the footer section around line 1020–1025 and add `/wanted` link after the `貢獻者排行榜` entry:

```html
        <span style="color: rgba(184,160,184,0.3); font-size: 0.7rem;">·</span>
        <a routerLink="/wanted" style="
          font-size: 0.75rem; color: rgba(122,90,122,0.55);
          text-decoration: none; letter-spacing: 0.04em;
        ">資料待補充</a>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app.routes.ts src/app/pages/home/home.component.html
git commit -m "✨ feat(wanted): add /wanted route and footer navigation link"
```

---

## Task 4: Deep link `propose=true` in member-page

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.ts`

- [ ] **Step 1: Add queryParams subscription in ngOnInit**

In `src/app/pages/member-page/member-page.component.ts`, inside `ngOnInit()`, add after the `routeDataSub` assignment:

```typescript
    this.route.queryParams.subscribe(params => {
      if (params['propose'] === 'true') {
        this.showProposalPanel = true;
      }
    });
```

The updated `ngOnInit` will look like:

```typescript
  async ngOnInit() {
    this.supabaseAuth.authState$.subscribe(s => {
      this.isLoggedIn = !!s?.user;
      this.currentUserId = s?.user?.id ?? null;
    });
    this.adminRole.isAdmin$.subscribe(v => { this.isAdmin = v; });
    this.routeDataSub = this.route.data.subscribe(({ pageData }) => {
      this.applyPageData(pageData as MemberPageData);
    });
    this.route.queryParams.subscribe(params => {
      if (params['propose'] === 'true') {
        this.showProposalPanel = true;
      }
    });
  }
```

- [ ] **Step 2: Verify manually**

Navigate to `/wanted`, click「補充資料」on any member → should land on member page with proposal panel already open.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/member-page/member-page.component.ts
git commit -m "✨ feat(wanted): auto-open proposal panel via ?propose=true on member page"
```

---

## Task 5: Deep link `propose=true` in group-page

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts`

- [ ] **Step 1: Add queryParams subscription**

In `src/app/pages/group-page/group-page.component.ts`, find `ngOnInit()` and add after the `routeDataSub` assignment (follow the same pattern as Task 4, but use `showGroupProposalPanel`):

```typescript
    this.route.queryParams.subscribe(params => {
      if (params['propose'] === 'true') {
        this.showGroupProposalPanel = true;
      }
    });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/pages/group-page/group-page.component.ts
git commit -m "✨ feat(wanted): auto-open proposal panel via ?propose=true on group page"
```

---

## Task 6: Deep link `propose=true` in company-page

**Files:**
- Modify: `src/app/pages/company-page/company-page.component.ts`

- [ ] **Step 1: Read current ngOnInit in company-page**

Read `src/app/pages/company-page/company-page.component.ts` lines 50–80 to find where `ngOnInit` subscribes to route data.

- [ ] **Step 2: Add queryParams subscription**

Add after the `routeDataSub` assignment (use `showProposalPanel`):

```typescript
    this.route.queryParams.subscribe(params => {
      if (params['propose'] === 'true') {
        this.showProposalPanel = true;
      }
    });
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/company-page/company-page.component.ts
git commit -m "✨ feat(wanted): auto-open proposal panel via ?propose=true on company page"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/seitumbp2025/idol-genealogy && ng test --no-watch 2>&1 | tail -30
```

Expected: all tests pass, including the new completeness utils tests.

- [ ] **Step 2: Build check**

```bash
cd /Users/seitumbp2025/idol-genealogy && ng build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual smoke test checklist**

1. Navigate to `/wanted` → page loads, summary bar shows counts
2. Avatar grid shows coloured borders (red/yellow)
3. Tab switching between 成員 / 團體 / 公司 works
4. Click「補充資料」on a member → lands on `/member/:id?propose=true` with proposal panel open
5. Click「補充資料」on a group → proposal panel opens
6. Click「補充資料」on a company → proposal panel opens
7. Click avatar/name → navigates to entity page without opening panel
8. Footer link `/wanted` visible on home page

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -p
git commit -m "fix(wanted): address any issues from smoke test"
```
