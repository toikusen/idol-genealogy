# Song Placeholder Icon Design

**Date:** 2026-05-19
**Scope:** Original song cards in group-page and member-page

## Problem

Song cards display a YouTube thumbnail (80×54px) on the left when a `youtube_url` is present and a thumbnail can be extracted. When the URL is missing or the thumbnail can't be extracted, the left slot is empty, causing inconsistent layout across song cards in the same list.

## Solution

Always render an 80×54px element in the left slot. Use a pink dashed placeholder icon for cases where no thumbnail is available.

## Cases

| Condition | Left Slot |
|---|---|
| `youtube_url` present + thumbnail extractable | YouTube thumbnail with play button (unchanged) |
| `youtube_url` present + no extractable thumbnail | Placeholder icon, wrapped in `<a>` linking to the URL |
| No `youtube_url` | Placeholder icon, no link |

## Placeholder Visual Spec

- Size: 80×54px (identical to thumbnail)
- Border radius: `rounded-lg` (8px)
- Background: `rgba(236,72,153,0.05)`
- Border: `1.5px dashed rgba(236,72,153,0.35)`
- Icon: music note SVG, `stroke: rgba(236,72,153,0.7)`, 24×24px

## Files Changed

- `src/app/pages/group-page/group-page.component.html` — around line 804
- `src/app/pages/member-page/member-page.component.html` — around line 479

## Template Change Pattern

Replace current `@if (extractYouTubeThumbnail...)` standalone block with:

```html
@if (extractYouTubeThumbnail(song.youtube_url); as thumb) {
  <!-- existing thumbnail markup, unchanged -->
} @else if (song.youtube_url) {
  <a [href]="song.youtube_url" target="_blank" rel="noopener"
     [attr.aria-label]="'連結：' + song.title"
     class="flex-shrink-0 rounded-lg flex items-center justify-center"
     style="width:80px;height:54px;background:rgba(236,72,153,0.05);border:1.5px dashed rgba(236,72,153,0.35);">
    <!-- music note SVG -->
  </a>
} @else {
  <div class="flex-shrink-0 rounded-lg flex items-center justify-center"
       style="width:80px;height:54px;background:rgba(236,72,153,0.05);border:1.5px dashed rgba(236,72,153,0.35);">
    <!-- music note SVG -->
  </div>
}
```

Also remove the existing inline `▶ YouTube` text link (`@if (!extractYouTubeThumbnail(song.youtube_url) && song.youtube_url)` block) from the text area in both files, since the placeholder icon now handles that role.

## Out of Scope

- Dark mode theming (placeholder uses rgba values that work in both modes)
- Admin song pages
- Extracting a shared component (deferred; revisit if a third page needs this)
