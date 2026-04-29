// src/app/shared/proposal-panel/proposal-panel.component.ts
import { Component, Input, Output, EventEmitter, OnInit, AfterViewInit, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { ProposalService } from '../../core/proposal.service';
import { CompanyService } from '../../core/company.service';
import { PROPOSAL_ALLOWED_FIELDS, FIELD_LABELS } from '../../core/proposal-fields.config';
import { Company } from '../../models';
import { PhotoUploadComponent } from '../photo-upload/photo-upload.component';

@Component({
  selector: 'app-proposal-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, PhotoUploadComponent],
  styles: [`
    @media (prefers-color-scheme: dark) {
      /* Panel container */
      :host [role="dialog"] {
        background: #160c18 !important;
      }
      /* Header */
      :host .bg-pink-50 {
        background: rgba(232, 121, 160, 0.08) !important;
      }
      /* Footer / submitter section */
      :host .bg-gray-50 {
        background: rgba(22, 10, 26, 0.80) !important;
      }
      /* DELETE review box */
      :host .bg-red-50 {
        background: rgba(220, 38, 38, 0.08) !important;
      }
      :host .border-red-100 {
        border-color: rgba(220, 38, 38, 0.22) !important;
      }
      /* Error alert box */
      :host .text-red-500.bg-red-50 {
        background: rgba(220, 38, 38, 0.10) !important;
      }
      /* Borders */
      :host .border-gray-100 {
        border-color: rgba(210, 175, 210, 0.12) !important;
      }
      :host .border-gray-200 {
        border-color: rgba(210, 175, 210, 0.18) !important;
      }
      /* Text */
      :host .text-gray-800 { color: var(--text-primary) !important; }
      :host .text-gray-700 { color: var(--text-secondary) !important; }
      :host .text-gray-600 { color: var(--text-faint-70) !important; }
      :host .text-gray-500 { color: var(--text-faint-55) !important; }
      :host .text-gray-400 { color: var(--text-faint-45) !important; }
      :host .text-gray-300 { color: var(--text-faint-35) !important; }
      /* Form controls */
      :host input:not([type="color"]):not([type="checkbox"]),
      :host select,
      :host textarea {
        background: var(--bg-surface) !important;
        border-color: var(--border-default) !important;
        color: var(--text-primary) !important;
      }
      :host input:disabled,
      :host select:disabled,
      :host textarea:disabled {
        background: rgba(30, 15, 32, 0.50) !important;
        color: var(--text-faint-45) !important;
        opacity: 1 !important;
      }
      :host input[type="color"] {
        background: var(--bg-card) !important;
        border-color: var(--border-subtle) !important;
      }
      /* select option text (browser-native) */
      :host select option {
        background: #160c18;
        color: var(--text-primary);
      }
    }
  `],
  template: `
    <!-- Overlay -->
    <button
      type="button"
      class="fixed inset-0 bg-black/40 z-40 border-0 p-0 cursor-default"
      aria-label="關閉提案面板"
      (click)="close()"
    ></button>

    <!-- Panel -->
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-panel-title"
      class="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-pink-50">
        <div>
          <h2 id="proposal-panel-title" class="text-base font-semibold text-gray-800">
            {{ operation === 'INSERT' ? '提案新增' : operation === 'DELETE' ? '回報問題' : '提案修改' }}
          </h2>
          <p class="text-xs text-gray-400 mt-0.5">{{ tableLabel }}</p>
        </div>
        <button (click)="close()" aria-label="關閉" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      <!-- Login banner (guests only) -->
      @if (!loggedInName) {
        <button
          type="button"
          (click)="router.navigate(['/login'])"
          class="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border-b transition-colors hover:opacity-90"
          style="color:rgba(124,108,242,0.9);background:rgba(124,108,242,0.07);border-color:rgba(124,108,242,0.15);"
        >🏆 登入以取得貢獻者排名</button>
      }

      <!-- Success state -->
      @if (submitted) {
        <div class="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div class="text-4xl">🎉</div>
          <p class="text-gray-700 font-medium">感謝您的回報！</p>
          <p class="text-sm text-gray-400">管理員審核後將會處理。</p>
          <button (click)="close()" class="mt-2 px-5 py-2 bg-pink-500 text-white rounded-full text-sm hover:bg-pink-600">
            關閉
          </button>
        </div>
      } @else if (operation === 'DELETE') {
        <!-- DELETE: report duplicate/error form -->
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          @if (error) {
            <p class="text-sm text-red-500 bg-red-50 rounded px-3 py-2">{{ error }}</p>
          }
          <!-- Summary of record being reported -->
          <div class="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-gray-700 space-y-1">
            <p class="text-xs font-medium text-red-500 mb-2">回報以下{{ tableLabel }}資料有問題：</p>
            @if (originalData['name']) {
              <p><span class="text-gray-400 text-xs">名稱：</span>{{ originalData['name'] }}</p>
            }
            @if (originalData['name_roman']) {
              <p><span class="text-gray-400 text-xs">英文名：</span>{{ originalData['name_roman'] }}</p>
            }
            @if (originalData['group']?.name || originalData['external_group_name']) {
              <p><span class="text-gray-400 text-xs">團體：</span>{{ originalData['group']?.name || originalData['external_group_name'] }}</p>
            }
            @if (originalData['joined_at']) {
              <p><span class="text-gray-400 text-xs">加入：</span>{{ originalData['joined_at']?.slice(0,10) }}</p>
            }
            @if (originalData['left_at']) {
              <p><span class="text-gray-400 text-xs">離開：</span>{{ originalData['left_at']?.slice(0,10) }}</p>
            }
            @if (originalData['status']) {
              <p><span class="text-gray-400 text-xs">狀態：</span>{{ statusLabel(originalData['status']) }}</p>
            }
          </div>
          <!-- Reason -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">回報原因（選填）</label>
            <textarea
              [(ngModel)]="formData['reason']"
              name="reason"
              rows="3"
              placeholder="例：此筆記錄與 xxx 重複，或資料有誤…"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
            ></textarea>
          </div>
          <!-- Submitter note -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">備註（選填）</label>
            <textarea
              [(ngModel)]="submitterNote"
              name="submitterNote"
              rows="3"
              placeholder="提供佐證資料，以利管理員審核（例如：社群貼文截圖說明、公告連結等）"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
            ></textarea>
          </div>
          <!-- Submitter info -->
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-500 mb-3">回報者資訊</p>
            @if (loggedInName) {
              <p class="text-sm text-gray-600">以 <span class="font-medium text-pink-600">{{ loggedInName }}</span> 身份回報</p>
            } @else {
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">暱稱 <span class="text-red-400">*</span></label>
                  <input type="text" [(ngModel)]="submitterName" name="submitterName"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                    placeholder="請輸入顯示名稱"/>
                </div>
              </div>
            }
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button (click)="submitProposal()" [disabled]="submitting"
            class="w-full py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full text-sm font-medium transition-colors">
            {{ submitting ? '送出中...' : '送出回報' }}
          </button>
        </div>
      } @else {
        <!-- Form -->
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          @if (error) {
            <p class="text-sm text-red-500 bg-red-50 rounded px-3 py-2">{{ error }}</p>
          }

          <!-- Field inputs -->
          @for (field of allowedFields; track field) {
            <div [attr.data-field]="field">
              <label class="block text-xs font-medium text-gray-600 mb-1">
                {{ fieldLabel(field) }}
              </label>

              <!-- Color picker (members + groups) -->
              @if (field === 'color') {
                <div class="flex items-center gap-3">
                  <input
                    type="color"
                    [(ngModel)]="formData['color']"
                    name="color_picker"
                    class="w-10 h-10 rounded border border-gray-200 cursor-pointer p-0.5 flex-shrink-0"
                  />
                  <input
                    type="text"
                    [(ngModel)]="formData['color']"
                    name="color"
                    placeholder="#e879a0"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                @if (operation === 'UPDATE' && original('color')) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original('color') }}</p>
                }

              <!-- Birthdate dropdowns (members: MM-DD) -->
              } @else if (tableName === 'members' && field === 'birthdate') {
                <div class="flex items-center gap-2">
                  <select
                    [(ngModel)]="birthdateMonth"
                    name="birthdateMonth"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  >
                    <option [value]="0">— 月 —</option>
                    @for (m of months; track m) {
                      <option [value]="m">{{ m }} 月</option>
                    }
                  </select>
                  <select
                    [(ngModel)]="birthdateDay"
                    name="birthdateDay"
                    [disabled]="!birthdateMonth"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50"
                  >
                    <option [value]="0">— 日 —</option>
                    @for (d of daysForMonth(birthdateMonth); track d) {
                      <option [value]="d">{{ d }} 日</option>
                    }
                  </select>
                </div>
                @if (operation === 'UPDATE' && original('birthdate')) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original('birthdate') }}</p>
                }
                <p class="text-xs text-gray-300 mt-0.5">只填確定的部分，不確定請留空</p>

              <!-- Founded date dropdowns (groups + companies: YYYY-MM-DD) -->
              } @else if ((tableName === 'groups' || tableName === 'companies') && field === 'founded_at') {
                <div class="flex items-center gap-2">
                  <select [(ngModel)]="foundedYear" name="foundedYear"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300">
                    <option [value]="0">— 年 —</option>
                    @for (y of years; track y) {
                      <option [value]="y">{{ y }}</option>
                    }
                  </select>
                  <select [(ngModel)]="foundedMonth" name="foundedMonth"
                    [disabled]="!foundedYear"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50">
                    <option [value]="0">— 月 —</option>
                    @for (m of months; track m) {
                      <option [value]="m">{{ m }} 月</option>
                    }
                  </select>
                  <select [(ngModel)]="foundedDay" name="foundedDay"
                    [disabled]="!foundedMonth"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50">
                    <option [value]="0">— 日 —</option>
                    @for (d of daysForMonth(foundedMonth); track d) {
                      <option [value]="d">{{ d }} 日</option>
                    }
                  </select>
                </div>
                @if (operation === 'UPDATE' && original('founded_at')) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original('founded_at') }}</p>
                }
                <p class="text-xs text-gray-300 mt-0.5">例：2019 年 4 月成立 → 選 2019 / 04，日期不確定可留空</p>

              <!-- Disbanded date dropdowns (groups: YYYY-MM-DD) -->
              } @else if (tableName === 'groups' && field === 'disbanded_at') {
                <div class="flex items-center gap-2">
                  <select [(ngModel)]="disbandedYear" name="disbandedYear"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300">
                    <option [value]="0">— 年 —</option>
                    @for (y of years; track y) {
                      <option [value]="y">{{ y }}</option>
                    }
                  </select>
                  <select [(ngModel)]="disbandedMonth" name="disbandedMonth"
                    [disabled]="!disbandedYear"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50">
                    <option [value]="0">— 月 —</option>
                    @for (m of months; track m) {
                      <option [value]="m">{{ m }} 月</option>
                    }
                  </select>
                  <select [(ngModel)]="disbandedDay" name="disbandedDay"
                    [disabled]="!disbandedMonth"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50">
                    <option [value]="0">— 日 —</option>
                    @for (d of daysForMonth(disbandedMonth); track d) {
                      <option [value]="d">{{ d }} 日</option>
                    }
                  </select>
                </div>
                @if (operation === 'UPDATE' && original('disbanded_at')) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original('disbanded_at') }}</p>
                }
                <p class="text-xs text-gray-300 mt-0.5">仍在活動中請留空</p>

              <!-- Company dropdown (groups: company_id) -->
              } @else if (tableName === 'groups' && field === 'company_id') {
                <select
                  [(ngModel)]="formData['company_id']"
                  name="company_id"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option [value]="''">— 無 —</option>
                  @for (c of companies; track c.id) {
                    <option [value]="c.id">{{ c.name }}</option>
                  }
                </select>
                @if (operation === 'UPDATE' && currentCompanyName) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ currentCompanyName }}</p>
                }

              <!-- history INSERT: member_id field -->
              } @else if (tableName === 'history' && operation === 'INSERT' && field === 'member_id') {
                <!-- toggle (only if member is NOT pre-filled from context) -->
                @if (!originalData['member_id']) {
                  <div class="flex rounded-lg overflow-hidden border border-gray-600 text-xs mb-1">
                    <button type="button"
                      (click)="isExternalRecord = false"
                      class="flex-1 py-1.5 transition-colors"
                      [class.bg-pink-500]="!isExternalRecord" [class.text-white]="!isExternalRecord"
                      [class.bg-transparent]="isExternalRecord" [class.text-gray-400]="isExternalRecord">
                      台灣團體
                    </button>
                    <button type="button"
                      (click)="isExternalRecord = true"
                      class="flex-1 py-1.5 transition-colors"
                      [class.bg-pink-500]="isExternalRecord" [class.text-white]="isExternalRecord"
                      [class.bg-transparent]="!isExternalRecord" [class.text-gray-400]="!isExternalRecord">
                      海外團體/solo
                    </button>
                  </div>
                  @if (isExternalRecord) {
                    <p class="text-xs text-gray-400 mb-3">海外團體請填國家欄位；solo 個人活動請留空國家欄位，系統將顯示為「solo」</p>
                  } @else {
                    <div class="mb-3"></div>
                  }
                }
                @if (originalData['member_id']) {
                  <!-- toggle when member is pre-filled -->
                  <div class="flex rounded-lg overflow-hidden border border-gray-600 text-xs mb-1">
                    <button type="button"
                      (click)="isExternalRecord = false"
                      class="flex-1 py-1.5 transition-colors"
                      [class.bg-pink-500]="!isExternalRecord" [class.text-white]="!isExternalRecord"
                      [class.bg-transparent]="isExternalRecord" [class.text-gray-400]="isExternalRecord">
                      台灣團體
                    </button>
                    <button type="button"
                      (click)="isExternalRecord = true"
                      class="flex-1 py-1.5 transition-colors"
                      [class.bg-pink-500]="isExternalRecord" [class.text-white]="isExternalRecord"
                      [class.bg-transparent]="!isExternalRecord" [class.text-gray-400]="!isExternalRecord">
                      海外團體/solo
                    </button>
                  </div>
                  @if (isExternalRecord) {
                    <p class="text-xs text-gray-400 mb-3">海外團體請填國家欄位；solo 個人活動請留空國家欄位，系統將顯示為「solo」</p>
                  } @else {
                    <div class="mb-3"></div>
                  }
                  <!-- member pre-filled: show as disabled -->
                  <input type="text" [value]="currentMemberName" disabled
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50 cursor-not-allowed"/>
                } @else {
                  <!-- member dropdown -->
                  <input type="text" [(ngModel)]="memberSearch" name="memberSearch"
                    placeholder="輸入名字搜尋成員…"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 mb-1"/>
                  <select [(ngModel)]="formData['member_id']" name="member_id"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300">
                    <option [value]="''">— 請選擇成員 —</option>
                    @for (m of filteredMembers; track m.id) {
                      <option [value]="m.id">{{ m.name }}</option>
                    }
                  </select>
                }

              <!-- Member dropdown with search (history UPDATE: member_id) -->
              } @else if (tableName === 'history' && field === 'member_id') {
                <input
                  type="text"
                  [(ngModel)]="memberSearch"
                  name="memberSearch"
                  placeholder="輸入名字搜尋成員…"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 mb-1"
                />
                <select
                  [(ngModel)]="formData['member_id']"
                  name="member_id"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option [value]="''">— 請選擇成員 —</option>
                  @for (m of filteredMembers; track m.id) {
                    <option [value]="m.id">{{ m.name }}</option>
                  }
                </select>
                @if (operation === 'UPDATE' && currentMemberName) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ currentMemberName }}</p>
                }

              <!-- Group selector (history INSERT, internal only) -->
              } @else if (tableName === 'history' && field === 'group_id') {
                @if (originalData['group_id']) {
                  <!-- group pre-filled from group page: show as disabled -->
                  <input type="text" [value]="currentGroupName" disabled
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50 cursor-not-allowed"/>
                } @else {
                  <!-- group dropdown for member page context -->
                  <input type="text" [(ngModel)]="groupSearch" name="groupSearch"
                    placeholder="輸入團體名搜尋…"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 mb-1"/>
                  <select [(ngModel)]="formData['group_id']" name="group_id"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300">
                    <option [value]="''">— 請選擇團體 —</option>
                    @for (g of filteredGroups; track g.id) {
                      <option [value]="g.id">{{ g.name }}</option>
                    }
                  </select>
                }

              <!-- Status dropdown (history) -->
              } @else if (tableName === 'history' && field === 'status') {
                <select
                  [(ngModel)]="formData['status']"
                  name="status"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option [value]="''">— 請選擇狀態 —</option>
                  @for (s of historyStatusOptions; track s.value) {
                    <option [value]="s.value">{{ s.label }}</option>
                  }
                </select>
                @if (operation === 'UPDATE' && original('status')) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ statusLabel(original('status')) }}</p>
                }

              <!-- Joined date dropdowns (history: YYYY-MM-DD) -->
              } @else if (tableName === 'history' && field === 'joined_at') {
                <div class="flex items-center gap-2">
                  <select [(ngModel)]="joinedYear" name="joinedYear"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300">
                    <option [value]="0">— 年 —</option>
                    @for (y of years; track y) {
                      <option [value]="y">{{ y }}</option>
                    }
                  </select>
                  <select [(ngModel)]="joinedMonth" name="joinedMonth"
                    [disabled]="!joinedYear"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50">
                    <option [value]="0">— 月 —</option>
                    @for (m of months; track m) {
                      <option [value]="m">{{ m }} 月</option>
                    }
                  </select>
                  <select [(ngModel)]="joinedDay" name="joinedDay"
                    [disabled]="!joinedMonth"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50">
                    <option [value]="0">— 日 —</option>
                    @for (d of daysForMonth(joinedMonth); track d) {
                      <option [value]="d">{{ d }} 日</option>
                    }
                  </select>
                </div>
                @if (operation === 'UPDATE' && original('joined_at')) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original('joined_at') }}</p>
                }
                <p class="text-xs text-gray-300 mt-0.5">加入年月，不確定日期可只選年月</p>

              <!-- Left date dropdowns (history: YYYY-MM-DD) -->
              } @else if (tableName === 'history' && field === 'left_at') {
                <div class="flex items-center gap-2">
                  <select [(ngModel)]="leftYear" name="leftYear"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300">
                    <option [value]="0">— 年 —</option>
                    @for (y of years; track y) {
                      <option [value]="y">{{ y }}</option>
                    }
                  </select>
                  <select [(ngModel)]="leftMonth" name="leftMonth"
                    [disabled]="!leftYear"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50">
                    <option [value]="0">— 月 —</option>
                    @for (m of months; track m) {
                      <option [value]="m">{{ m }} 月</option>
                    }
                  </select>
                  <select [(ngModel)]="leftDay" name="leftDay"
                    [disabled]="!leftMonth"
                    class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50">
                    <option [value]="0">— 日 —</option>
                    @for (d of daysForMonth(leftMonth); track d) {
                      <option [value]="d">{{ d }} 日</option>
                    }
                  </select>
                </div>
                @if (operation === 'UPDATE' && original('left_at')) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original('left_at') }}</p>
                }
                <p class="text-xs text-gray-300 mt-0.5">仍在籍請留空</p>

              <!-- Photo upload -->
              } @else if (field === 'photo_url') {
                <app-photo-upload
                  [(ngModel)]="formData['photo_url']"
                  name="photo_url"
                  [folder]="photoUploadFolder"
                />
                @if (operation === 'UPDATE' && original('photo_url')) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original('photo_url') }}</p>
                }

              <!-- Default: text input -->
              } @else {
                <input
                  type="text"
                  [(ngModel)]="formData[field]"
                  [name]="field"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  [placeholder]="fieldPlaceholder(field)"
                />
                @if (operation === 'UPDATE' && original(field)) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original(field) }}</p>
                }
              }

              @if (fieldErrors[field]) {
                <p class="text-xs text-red-500 mt-1">{{ fieldErrors[field] }}</p>
              }
            </div>
          }

          <!-- Submitter note -->
          <div class="border-t border-gray-100 pt-4">
            <label class="block text-xs font-medium text-gray-600 mb-1">備註（選填）</label>
            <textarea
              [(ngModel)]="submitterNote"
              name="submitterNote"
              rows="3"
              placeholder="提供佐證資料，以利管理員審核（例如：社群貼文截圖說明、公告連結等）"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
            ></textarea>
          </div>

          <!-- Divider -->
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-500 mb-3">提案者資訊</p>

            @if (loggedInName) {
              <p class="text-sm text-gray-600">以 <span class="font-medium text-pink-600">{{ loggedInName }}</span> 身份提案</p>
            } @else {
              <div class="space-y-3">
                <div data-field="submitterName">
                  <label class="block text-xs font-medium text-gray-600 mb-1">暱稱 <span class="text-red-400">*</span></label>
                  <input
                    type="text"
                    [(ngModel)]="submitterName"
                    name="submitterName"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                    placeholder="請輸入顯示名稱"
                  />
                  @if (fieldErrors['submitterName']) {
                    <p class="text-xs text-red-500 mt-1">{{ fieldErrors['submitterName'] }}</p>
                  }
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Email（選填）</label>
                  <input
                    type="email"
                    [(ngModel)]="submitterEmail"
                    name="submitterEmail"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                    placeholder="供通知使用（不公開）"
                  />
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            (click)="submitProposal()"
            [disabled]="submitting"
            class="w-full py-2.5 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white rounded-full text-sm font-medium transition-colors"
          >
            {{ submitting ? '送出中...' : '送出提案' }}
          </button>
          <p class="text-xs text-gray-400 text-center mt-2">提案僅供參考，最終由管理員審核</p>
        </div>
      }
    </div>
  `,
})
export class ProposalPanelComponent implements OnInit, AfterViewInit {
  @Input() tableName: 'members' | 'groups' | 'history' | 'companies' = 'members';
  @Input() recordId: string | null = null;
  @Input() operation: 'INSERT' | 'UPDATE' | 'DELETE' = 'UPDATE';
  @Input() originalData: Record<string, any> = {};
  /** For history proposals: full member list to pick from */
  @Input() groupMembers: { id: string; name: string }[] = [];
  memberSearch = '';
  /** For history proposals from member page: groups list for dropdown */
  @Input() groups: { id: string; name: string }[] = [];
  groupSearch = '';
  /** Fields that must be non-empty before submission */
  @Input() requiredFields: string[] = [];
  /** Force external mode (e.g. opened from member page) */
  @Input() forceExternal = false;
  @Output() closed = new EventEmitter<void>();

  formData: Record<string, any> = {};
  submitterName = '';
  submitterEmail = '';
  submitterNote = '';
  loggedInName: string | null = null;
  loggedInId: string | null = null;
  submitting = false;
  submitted = false;
  error = '';
  fieldErrors: Record<string, string> = {};
  isExternalRecord = false;

  // Companies list for groups dropdown
  companies: Company[] = [];
  get currentCompanyName(): string {
    const id = this.originalData?.['company_id'];
    return this.companies.find(c => c.id === id)?.name ?? id ?? '';
  }

  // Member name for history UPDATE display
  get filteredMembers(): { id: string; name: string }[] {
    const q = this.memberSearch.trim().toLowerCase();
    if (!q) return this.groupMembers;
    return this.groupMembers.filter(m => m.name.toLowerCase().includes(q));
  }

  get filteredGroups(): { id: string; name: string }[] {
    const q = this.groupSearch.trim().toLowerCase();
    if (!q) return this.groups;
    return this.groups.filter(g => g.name.toLowerCase().includes(q));
  }

  get currentGroupName(): string {
    const id = this.originalData?.['group_id'] || this.formData['group_id'];
    return this.groups.find(g => g.id === id)?.name ?? id ?? '';
  }

  get currentMemberName(): string {
    const id = this.originalData?.['member_id'];
    return this.groupMembers.find(m => m.id === id)?.name ?? id ?? '';
  }

  // Birthdate selectors (members: MM-DD)
  birthdateMonth = 0;
  birthdateDay = 0;

  // Founded / disbanded date selectors (groups: YYYY-MM-DD)
  foundedYear = 0;
  foundedMonth = 0;
  foundedDay = 0;
  disbandedYear = 0;
  disbandedMonth = 0;
  disbandedDay = 0;

  // Joined / left date selectors (history: YYYY-MM-DD)
  joinedYear = 0;
  joinedMonth = 0;
  joinedDay = 0;
  leftYear = 0;
  leftMonth = 0;
  leftDay = 0;

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);
  readonly years = Array.from(
    { length: new Date().getFullYear() - 1999 },
    (_, i) => 2000 + i
  );

  readonly historyStatusOptions = [
    { value: 'active', label: '正常在籍' },
    { value: 'concurrent', label: '兼任' },
    { value: 'transferred', label: '移籍' },
    { value: 'graduated', label: '畢業' },
  ];

  daysForMonth(month: number): number[] {
    const max = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
    return Array.from({ length: max }, (_, i) => i + 1);
  }

  statusLabel(value: string): string {
    return this.historyStatusOptions.find(s => s.value === value)?.label ?? value;
  }

  get allowedFields(): string[] {
    const fields = PROPOSAL_ALLOWED_FIELDS[this.tableName] ?? [];
    if (this.tableName === 'history') {
      if (this.isExternalRecord) {
        // Hide group_id for external records (uses external_group_name instead)
        return fields.filter(f => f !== 'group_id');
      } else {
        // Hide external fields for internal records
        return fields.filter(f => f !== 'external_group_name' && f !== 'external_country');
      }
    }
    return fields;
  }

  get photoUploadFolder(): 'members' | 'groups' | 'companies' {
    if (this.tableName === 'groups') return 'groups';
    if (this.tableName === 'companies') return 'companies';
    return 'members';
  }

  get tableLabel(): string {
    return { members: '成員', groups: '團體', history: '活動歷程', companies: '公司' }[this.tableName] ?? '';
  }

  fieldLabel(field: string): string {
    const label = FIELD_LABELS[this.tableName]?.[field] ?? field;
    const isRequired = this.requiredFields.includes(field)
      && !(this.isExternalRecord && field === 'group_id');
    return isRequired ? label + ' *' : label;
  }

  private readonly URL_FIELDS = new Set(['instagram', 'facebook', 'x', 'maid_url', 'youtube', 'website', 'photo_url']);

  fieldPlaceholder(field: string): string {
    const hints: Record<string, string> = {
      'history:external_group_name': '例：花丸、AKB48；solo 活動可填藝名',
      'history:external_country': '例：日本、香港（solo 個人活動請留空）',
      'members:name': '例：あいみ（日文名）',
      'members:name_hiragana': '例：あいみ',
      'members:name_roman': '例：Aimi（英文/羅馬字）',
      'members:emoji': '例：🍓',
      'groups:name': '例：KissBee',
      'members:instagram': 'https://www.instagram.com/username/',
      'members:facebook': 'https://www.facebook.com/username',
      'members:x': 'https://x.com/username',
      'members:maid_url': 'https://...',
      'groups:instagram': 'https://www.instagram.com/username/',
      'groups:facebook': 'https://www.facebook.com/username',
      'groups:x': 'https://x.com/username',
      'groups:youtube': 'https://www.youtube.com/@channel',
      'groups:photo_url': 'https://...',
      'companies:instagram': 'https://www.instagram.com/username/',
      'companies:facebook': 'https://www.facebook.com/username',
      'companies:x': 'https://x.com/username',
      'companies:youtube': 'https://www.youtube.com/@channel',
      'companies:website': 'https://example.com',
      'companies:photo_url': 'https://...',
    };
    return hints[`${this.tableName}:${field}`] ?? this.original(field);
  }

  isRequired(field: string): boolean {
    return this.requiredFields.includes(field);
  }

  private scrollToField(field: string) {
    const el = this.el.nativeElement.querySelector(`[data-field="${field}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  original(field: string): string {
    const val = this.originalData?.[field];
    return val != null ? String(val) : '';
  }

  constructor(
    private supabase: SupabaseService,
    private proposalService: ProposalService,
    private companyService: CompanyService,
    public router: Router,
    private el: ElementRef,
  ) {}

  ngAfterViewInit() {
    setTimeout(() => {
      const host = this.el.nativeElement as HTMLElement;
      const closeBtn = host.querySelector('button[aria-label="關閉"]') as HTMLElement | null;
      closeBtn?.focus();
    });
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { this.close(); return; }
    if (event.key !== 'Tab') return;
    const host = this.el.nativeElement as HTMLElement;
    const panel = host.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!panel) return;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const nodes = panel.querySelectorAll(selector) as NodeListOf<HTMLElement>;
    const focusable: HTMLElement[] = [];
    nodes.forEach((el: HTMLElement) => { if (!el.closest('[hidden]')) focusable.push(el); });
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  async ngOnInit() {
    if (this.forceExternal) this.isExternalRecord = true;

    // Pre-fill form with allowed fields from originalData
    for (const field of this.allowedFields) {
      this.formData[field] = this.originalData?.[field] ?? '';
    }

    // Members: parse birthdate into month/day selectors
    if (this.tableName === 'members') {
      this.parseBirthdate(this.originalData?.['birthdate']);
    }

    // Groups: parse dates into year/month/day selectors, load companies
    if (this.tableName === 'groups') {
      this.parseYMD(this.originalData?.['founded_at'], 'founded');
      this.parseYMD(this.originalData?.['disbanded_at'], 'disbanded');
      this.companies = await this.companyService.getAll().catch(() => []);
      this.formData['company_id'] = this.originalData?.['company_id'] ?? '';
    }

    // Companies: parse founded_at
    if (this.tableName === 'companies') {
      this.parseYMD(this.originalData?.['founded_at'], 'founded');
    }

    // History: parse joined_at / left_at into year/month/day selectors
    if (this.tableName === 'history') {
      this.parseYMD(this.originalData?.['joined_at'], 'joined');
      this.parseYMD(this.originalData?.['left_at'], 'left');
    }

    const session = await this.supabase.getSessionOnce();
    if (session?.user) {
      this.loggedInName = session.user.user_metadata?.['full_name']
        ?? session.user.email
        ?? null;
      this.loggedInId = session.user.id;
    }
  }

  private parseBirthdate(value: string | null | undefined) {
    if (!value) { this.birthdateMonth = 0; this.birthdateDay = 0; return; }
    const mmdd = value.match(/^(\d{1,2})-(\d{1,2})$/);
    if (mmdd) { this.birthdateMonth = +mmdd[1]; this.birthdateDay = +mmdd[2]; return; }
    const full = value.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    if (full) { this.birthdateMonth = +full[1]; this.birthdateDay = +full[2]; return; }
    this.birthdateMonth = 0; this.birthdateDay = 0;
  }

  private parseYMD(value: string | null | undefined, prefix: 'founded' | 'disbanded' | 'joined' | 'left') {
    const ymd = value?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) {
      const y = +ymd[1], m = +ymd[2], d = +ymd[3];
      if (prefix === 'founded') { this.foundedYear = y; this.foundedMonth = m; this.foundedDay = d; }
      else if (prefix === 'disbanded') { this.disbandedYear = y; this.disbandedMonth = m; this.disbandedDay = d; }
      else if (prefix === 'joined') { this.joinedYear = y; this.joinedMonth = m; this.joinedDay = d; }
      else { this.leftYear = y; this.leftMonth = m; this.leftDay = d; }
    }
  }

  private buildYMD(year: number, month: number, day: number): string {
    if (!year || !month || !day) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  close() {
    this.closed.emit();
  }

  async submitProposal() {
    this.error = '';
    this.fieldErrors = {};

    // DELETE proposals: snapshot original_data, store optional reason
    if (this.operation === 'DELETE') {
      if (!this.loggedInName && !this.submitterName.trim()) {
        this.fieldErrors['submitterName'] = '此欄位為必填';
        this.scrollToField('submitterName');
        return;
      }
      this.submitting = true;
      try {
        const session = await this.supabase.getSessionOnce();
        await this.proposalService.submit({
          table_name: this.tableName,
          record_id: this.recordId,
          operation: 'DELETE',
          proposed_data: { reason: this.formData['reason'] || '' },
          original_data: this.originalData,
          submitter_id: session?.user?.id ?? null,
          submitter_name: this.loggedInName ?? this.submitterName.trim(),
          submitter_email: this.submitterEmail || null,
          submitter_note: this.submitterNote.trim() || null,
        });
        this.submitted = true;
      } catch (e: any) {
        this.error = e.message ?? '送出失敗，請稍後再試';
      } finally {
        this.submitting = false;
      }
      return;
    }

    // Combine birthdate selectors → MM-DD
    if (this.tableName === 'members') {
      this.formData['birthdate'] = (this.birthdateMonth && this.birthdateDay)
        ? String(this.birthdateMonth).padStart(2, '0') + '-' + String(this.birthdateDay).padStart(2, '0')
        : '';
    }

    // Combine founded/disbanded selectors → YYYY-MM-DD
    if (this.tableName === 'groups') {
      this.formData['founded_at'] = this.buildYMD(this.foundedYear, this.foundedMonth, this.foundedDay);
      this.formData['disbanded_at'] = this.buildYMD(this.disbandedYear, this.disbandedMonth, this.disbandedDay);
    }
    if (this.tableName === 'companies') {
      this.formData['founded_at'] = this.buildYMD(this.foundedYear, this.foundedMonth, this.foundedDay);
    }

    // Combine joined_at/left_at selectors → YYYY-MM-DD
    if (this.tableName === 'history') {
      this.formData['joined_at'] = this.buildYMD(this.joinedYear, this.joinedMonth, this.joinedDay);
      this.formData['left_at'] = this.buildYMD(this.leftYear, this.leftMonth, this.leftDay);
    }

    // Build proposed_data: only include non-empty allowed fields
    const proposed: Record<string, any> = {};
    for (const field of this.allowedFields) {
      const val = this.formData[field];
      if (val !== '' && val != null) {
        proposed[field] = val;
      }
    }

    // For history proposals, resolve group_id (formData selection > originalData context)
    if (this.tableName === 'history' && !this.isExternalRecord) {
      const groupId = this.formData['group_id'] || this.originalData?.['group_id'];
      if (groupId) proposed['group_id'] = groupId;
    }
    // For external records, ensure group_id is absent
    if (this.isExternalRecord) {
      delete proposed['group_id'];
    }

    if (Object.keys(proposed).length === 0) {
      this.error = '請至少填寫一個欄位';
      return;
    }

    // Validate URL fields must start with https://
    const invalidUrlFields = Object.keys(proposed).filter(
      f => this.URL_FIELDS.has(f) && !String(proposed[f]).startsWith('https://')
    );
    if (invalidUrlFields.length > 0) {
      for (const f of invalidUrlFields) {
        this.fieldErrors[f] = '必須是以 https:// 開頭的網址';
      }
      this.scrollToField(invalidUrlFields[0]);
      return;
    }

    // When in external mode (海外/solo), group_id is not applicable — skip its required check
    const effectiveRequired = this.isExternalRecord
      ? this.requiredFields.filter(f => f !== 'group_id')
      : this.requiredFields;
    const missingRequired = effectiveRequired.filter(f => !proposed[f]);
    if (missingRequired.length > 0) {
      for (const f of missingRequired) {
        this.fieldErrors[f] = '此欄位為必填';
      }
      this.scrollToField(missingRequired[0]);
      return;
    }

    // Check submitter name after field validation
    if (!this.loggedInName && !this.submitterName.trim()) {
      this.fieldErrors['submitterName'] = '此欄位為必填';
      this.scrollToField('submitterName');
      return;
    }

    // For UPDATE: block if no field actually changed
    if (this.operation === 'UPDATE') {
      const hasChanges = Object.keys(proposed).some(
        f => String(proposed[f] ?? '') !== String(this.originalData?.[f] ?? '')
      );
      if (!hasChanges) {
        this.error = '尚未修改任何欄位，請至少更動一個欄位後再送出';
        return;
      }
    }

    this.submitting = true;
    try {
      await this.proposalService.submit({
        table_name: this.tableName,
        record_id: this.recordId,
        operation: this.operation,
        proposed_data: proposed,
        original_data: this.operation === 'UPDATE' ? this.originalData : null,
        submitter_id: this.loggedInId,
        submitter_name: this.loggedInName ?? this.submitterName.trim(),
        submitter_email: this.submitterEmail.trim() || null,
        submitter_note: this.submitterNote.trim() || null,
      });
      this.submitted = true;
    } catch (e: any) {
      this.error = e.message ?? '送出失敗，請稍後再試';
    } finally {
      this.submitting = false;
    }
  }
}
