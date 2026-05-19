# Song Placeholder Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原創曲卡片左側，針對無 YouTube 縮圖的情況顯示統一大小的 placeholder icon，讓排版整齊。

**Architecture:** 純 HTML template 修改，不動 TypeScript。將現有 `@if (extractYouTubeThumbnail...)` block 加上 `@else if` / `@else` 分支，分別 render 可點擊和純視覺的 placeholder。同時移除文字區的 `▶ YouTube` 小連結（placeholder 本身已承擔該功能）。

**Tech Stack:** Angular 17+ (`@if`/`@else` control flow syntax), Tailwind CSS, inline SVG

---

## Files

| Action | Path |
|--------|------|
| Modify | `src/app/pages/group-page/group-page.component.html` |
| Modify | `src/app/pages/member-page/member-page.component.html` |

---

## Task 1: 更新 group-page 的原創曲縮圖區塊

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.html:803-843`

目前 line 804–816 只有 `@if (有縮圖)` 一個分支，line 840–843 在文字區有小連結。
目標：加 `@else if (有 URL)` 和 `@else` 兩個分支，移除小連結。

- [ ] **Step 1: 替換縮圖 `@if` block（line 803–816）**

將以下舊程式碼：
```html
                    <!-- YouTube 縮圖 (若有) -->
                    @if (extractYouTubeThumbnail(song.youtube_url); as thumb) {
                      <a [href]="song.youtube_url" target="_blank" rel="noopener"
                        [attr.aria-label]="'在 YouTube 播放：' + song.title"
                        class="flex-shrink-0 relative block rounded-lg overflow-hidden"
                        style="width:80px;height:54px;background:#000;">
                        <img [src]="thumb" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;opacity:0.9;"/>
                        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5))">
                            <polygon points="5,3 19,12 5,21"/>
                          </svg>
                        </div>
                      </a>
                    }
```

替換為：
```html
                    <!-- 縮圖 / Placeholder -->
                    @if (extractYouTubeThumbnail(song.youtube_url); as thumb) {
                      <a [href]="song.youtube_url" target="_blank" rel="noopener"
                        [attr.aria-label]="'在 YouTube 播放：' + song.title"
                        class="flex-shrink-0 relative block rounded-lg overflow-hidden"
                        style="width:80px;height:54px;background:#000;">
                        <img [src]="thumb" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;opacity:0.9;"/>
                        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5))">
                            <polygon points="5,3 19,12 5,21"/>
                          </svg>
                        </div>
                      </a>
                    } @else if (song.youtube_url) {
                      <a [href]="song.youtube_url" target="_blank" rel="noopener"
                        [attr.aria-label]="'連結：' + song.title"
                        class="flex-shrink-0 rounded-lg flex items-center justify-center"
                        style="width:80px;height:54px;background:rgba(236,72,153,0.05);border:1.5px dashed rgba(236,72,153,0.35);">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M9 18V5l12-2v13" stroke="rgba(236,72,153,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          <circle cx="6" cy="18" r="3" stroke="rgba(236,72,153,0.7)" stroke-width="1.5"/>
                          <circle cx="18" cy="16" r="3" stroke="rgba(236,72,153,0.7)" stroke-width="1.5"/>
                        </svg>
                      </a>
                    } @else {
                      <div class="flex-shrink-0 rounded-lg flex items-center justify-center"
                        style="width:80px;height:54px;background:rgba(236,72,153,0.05);border:1.5px dashed rgba(236,72,153,0.35);">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M9 18V5l12-2v13" stroke="rgba(236,72,153,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          <circle cx="6" cy="18" r="3" stroke="rgba(236,72,153,0.7)" stroke-width="1.5"/>
                          <circle cx="18" cy="16" r="3" stroke="rgba(236,72,153,0.7)" stroke-width="1.5"/>
                        </svg>
                      </div>
                    }
```

- [ ] **Step 2: 移除文字區的 `▶ YouTube` 小連結（約 line 840–843）**

找到以下程式碼並刪除（整個 `@if` block，共 4 行）：
```html
                          @if (!extractYouTubeThumbnail(song.youtube_url) && song.youtube_url) {
                            <a [href]="song.youtube_url" target="_blank" rel="noopener"
                              class="text-xs text-pink-500 hover:underline mt-1 inline-block">▶ YouTube</a>
                          }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/group-page/group-page.component.html
git commit -m "✨ feat(group-page): add placeholder icon for songs without YouTube thumbnail"
```

---

## Task 2: 更新 member-page 的原創曲縮圖區塊

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.html:479-517`

與 Task 1 完全相同的改動，套用到 member-page。

- [ ] **Step 1: 替換縮圖 `@if` block（line 479–491）**

將以下舊程式碼：
```html
                @if (extractYouTubeThumbnail(song.youtube_url); as thumb) {
                  <a [href]="song.youtube_url" target="_blank" rel="noopener"
                    [attr.aria-label]="'在 YouTube 播放：' + song.title"
                    class="flex-shrink-0 relative block rounded-lg overflow-hidden"
                    style="width:80px;height:54px;background:#000;">
                    <img [src]="thumb" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;opacity:0.9;"/>
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5))">
                        <polygon points="5,3 19,12 5,21"/>
                      </svg>
                    </div>
                  </a>
                }
```

替換為：
```html
                <!-- 縮圖 / Placeholder -->
                @if (extractYouTubeThumbnail(song.youtube_url); as thumb) {
                  <a [href]="song.youtube_url" target="_blank" rel="noopener"
                    [attr.aria-label]="'在 YouTube 播放：' + song.title"
                    class="flex-shrink-0 relative block rounded-lg overflow-hidden"
                    style="width:80px;height:54px;background:#000;">
                    <img [src]="thumb" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;opacity:0.9;"/>
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5))">
                        <polygon points="5,3 19,12 5,21"/>
                      </svg>
                    </div>
                  </a>
                } @else if (song.youtube_url) {
                  <a [href]="song.youtube_url" target="_blank" rel="noopener"
                    [attr.aria-label]="'連結：' + song.title"
                    class="flex-shrink-0 rounded-lg flex items-center justify-center"
                    style="width:80px;height:54px;background:rgba(236,72,153,0.05);border:1.5px dashed rgba(236,72,153,0.35);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18V5l12-2v13" stroke="rgba(236,72,153,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <circle cx="6" cy="18" r="3" stroke="rgba(236,72,153,0.7)" stroke-width="1.5"/>
                      <circle cx="18" cy="16" r="3" stroke="rgba(236,72,153,0.7)" stroke-width="1.5"/>
                    </svg>
                  </a>
                } @else {
                  <div class="flex-shrink-0 rounded-lg flex items-center justify-center"
                    style="width:80px;height:54px;background:rgba(236,72,153,0.05);border:1.5px dashed rgba(236,72,153,0.35);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18V5l12-2v13" stroke="rgba(236,72,153,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <circle cx="6" cy="18" r="3" stroke="rgba(236,72,153,0.7)" stroke-width="1.5"/>
                      <circle cx="18" cy="16" r="3" stroke="rgba(236,72,153,0.7)" stroke-width="1.5"/>
                    </svg>
                  </div>
                }
```

- [ ] **Step 2: 移除文字區的 `▶ YouTube` 小連結（約 line 514–517）**

找到以下程式碼並刪除（整個 `@if` block，共 4 行）：
```html
                      @if (!extractYouTubeThumbnail(song.youtube_url) && song.youtube_url) {
                        <a [href]="song.youtube_url" target="_blank" rel="noopener"
                          class="text-xs text-pink-500 hover:underline mt-1 inline-block">▶ YouTube</a>
                      }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/member-page/member-page.component.html
git commit -m "✨ feat(member-page): add placeholder icon for songs without YouTube thumbnail"
```

---

## Task 3: 視覺驗證

**Files:** (no changes)

- [ ] **Step 1: 啟動 dev server**

```bash
ng serve
```

打開 `http://localhost:4200`，前往任一 group 頁面或 member 頁面，查看原創曲列表。

- [ ] **Step 2: 確認三種情境都正確**

| 情境 | 預期 |
|------|------|
| 有 YouTube URL + 可抓縮圖 | 左側顯示影片縮圖，有播放按鈕 |
| 有 YouTube URL + 無法抓縮圖 | 左側顯示粉色虛線方框 + 音符，可點擊開啟 URL |
| 無 youtube_url | 左側顯示粉色虛線方框 + 音符，不可點擊 |

- [ ] **Step 3: 確認排版對齊**

在同一個列表中同時有「有縮圖」和「無縮圖」的曲目時，左側欄位寬度應該一致（都是 80px），文字對齊不跑版。
