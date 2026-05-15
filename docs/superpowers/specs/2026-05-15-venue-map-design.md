# Venue Interactive Map — Design Spec

**Date:** 2026-05-15
**Status:** Approved (revised after code review)

## Overview

Add an interactive geographic map to the Venues tab on the home page, placed above the region filter buttons. Users can see all venue markers on a real map of Taiwan, click a marker to view venue details and upcoming events, and use region filters to narrow both the map markers and the card list below.

---

## UX Decisions

### Layout

```
[ Venues tab ]
  ┌─────────────────────────────────────────┐
  │         Leaflet 地圖 (全寬, 400px)        │
  │   📍 北部  📍          📍 中部            │
  │              📍 南部                     │
  └─────────────────────────────────────────┘
  ┌─────────────────────────────────────────┐
  │ 區域篩選 — 同步過濾地圖與列表              │
  │ [全部] [北部] [中部] [南部]               │
  └─────────────────────────────────────────┘
  ┌─────────────────────────────────────────┐
  │ 場地卡片列表（同現有）                    │
  └─────────────────────────────────────────┘
```

- Filter buttons placed **between** map and list, with label "區域篩選 — 同步過濾地圖與列表"
- Filtering affects both map markers and card list simultaneously
- Single `activeVenueRegionFilter` state drives everything

### Map Behavior

- **Library:** Leaflet.js (open-source, no API key, used by vegemap.org)
- **Tile layer:** OpenStreetMap (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)
- **Leaflet CSS:** must be loaded via `angular.json` styles array (`node_modules/leaflet/dist/leaflet.css`) — required for zoom controls, popup positioning, and marker rendering
- **Initial view:** `fitBounds()` on all loaded venue markers — shows all visible venues automatically
- **Fallback center** (no venues): `[25.045, 121.51]`, zoom 12 (Taipei center)
- **SSR safety:** dynamic `import('leaflet')` behind `isPlatformBrowser` check

### Marker Design

- Custom `divIcon` HTML markers, circle + pin shape
- Color by region, matching existing design system accent colors:
  - 北部: `#e879a0` (pink)
  - 中部: `#7c6cf2` (purple)
  - 南部: `#f59e0b` (amber)
- Venues without `latitude`/`longitude`: hidden from map, still shown in card list

### Popup (on marker click)

Leaflet popup renders as a plain HTML string — Angular template bindings do not work inside it.

**Content:**
- Venue name (bold)
- Address (text only — no copy button; copy button stays in the card list below)
- Type badge (if present)
- Upcoming events list (loading / error / event rows)
- Google Maps link (if `google_maps_url` present)
- Click outside popup to close

**XSS:** all user-supplied strings (`venue.name`, `venue.address`, `venue.type`, `event.title`) must be HTML-escaped before insertion into the popup HTML string. Use a shared `escapeHtml()` utility.

**Popup refresh (Map/Set mutation problem):**
`venueEvents`, `venueEventsLoaded`, `venueEventsLoading`, `venueEventsError` are all mutated in-place in `HomeComponent` (`.set()`, `.add()`, `.delete()`). Angular's `ngOnChanges` fires on reference change only, so passing these Maps/Sets as `@Input()` will not trigger updates.

Solution: `VenueMapComponent` exposes a **public `refreshPopup(venueId: string)`** method. `HomeComponent` holds a `@ViewChild(VenueMapComponent)` reference and calls `refreshPopup(venueId)` after `loadVenueEvents()` resolves. The method re-reads the current Map/Set state and updates the open popup's content if it matches that venue id.

### Mobile

- Map height: `400px` on desktop, `260px` on `≤640px` screens
- Popup max-width: `280px`

---

## Data Layer

### Shared Type

Move `VenueRegionFilter` out of `home.component.ts` (currently a local type at line 26) and into `src/app/models/index.ts` so `VenueMapComponent` can import it cleanly:

```typescript
// models/index.ts
export type VenueRegionFilter = 'all' | 'north' | 'central' | 'south';
```

### DB Migration

Create a Supabase migration file (e.g. `supabase/migrations/YYYYMMDDHHMMSS_venues_add_coords.sql`):

```sql
ALTER TABLE venues
  ADD COLUMN latitude  FLOAT,
  ADD COLUMN longitude FLOAT;
```

Both columns are nullable. Venues with null coordinates appear in the card list but not on the map.

### Model Update

```typescript
// models/index.ts
export interface Venue {
  // ...existing fields...
  latitude?:  number | null;
  longitude?: number | null;
}
```

Fields are **optional** (`?`) so existing fixtures (e.g. `venue.service.spec.ts` `mockVenue`) do not need to be updated — TypeScript will not error on missing optional fields. `VenueService.getAll()` requires no changes — `select('*')` picks up new columns automatically.

---

## Components

### New: `VenueMapComponent`

**Path:** `src/app/shared/venue-map/venue-map.component.ts`

**Inputs:**
```typescript
@Input() venues: Venue[] = [];
@Input() activeRegion: VenueRegionFilter = 'all';
```

**Outputs:**
```typescript
@Output() regionChange       = new EventEmitter<VenueRegionFilter>();
@Output() venuePopupOpened   = new EventEmitter<string>(); // emits venue.id
```

**Public method (called by parent via ViewChild):**
```typescript
refreshPopup(venueId: string): void
// Re-reads venueEvents/Loading/Error from HomeComponent and updates
// the currently-open popup's HTML if it belongs to venueId.
// HomeComponent passes state via a callback or direct Map reference,
// not via @Input, to avoid the ngOnChanges/mutation problem.
```

**State access pattern:** `HomeComponent` passes a `getEventState(venueId)` callback function (not the Maps directly as `@Input`) so `VenueMapComponent` can read current state on demand when rendering or refreshing popup content.

**Responsibilities:**
- Initialize Leaflet map (browser-only, dynamic import)
- Render colored `divIcon` markers for venues with coordinates
- Show/hide markers based on `activeRegion` input (via `ngOnChanges` — safe since `activeRegion` is a primitive string)
- Call `map.fitBounds()` when visible markers change
- On marker click: open Leaflet popup with HTML-escaped content, emit `venuePopupOpened` with `venue.id`
- `refreshPopup(venueId)`: update open popup content by re-reading state via callback

### Modified: `HomeComponent`

- Import and add `<app-venue-map>` inside the venues tab panel, above filter buttons
- Add `@ViewChild(VenueMapComponent) venueMap?: VenueMapComponent`
- Move filter button section below map, add label "區域篩選 — 同步過濾地圖與列表"
- Pass `venues`, `activeVenueRegionFilter` as `@Input()`; pass `getEventState` callback
- Handle `(regionChange)` output to update `activeVenueRegionFilter`
- Handle `(venuePopupOpened)` output: call **`loadVenueEvents(venue)`** only (not `toggleVenue` — do not expand the card list entry); after `loadVenueEvents` resolves, call `this.venueMap?.refreshPopup(venueId)`

### Modified: `AdminVenuesComponent`

**New fields in venue create/edit form:**
- `latitude`: number input, optional, label "緯度 (Latitude)"
- `longitude`: number input, optional, label "經度 (Longitude)"
- "自動帶入座標" button:
  - Disabled when `address` field is empty or geocoding is in progress (prevent double-click)
  - On click: `fetch` Nominatim geocoding API with properly URL-encoded address
  - Shows loading spinner while fetching
  - On success: fills `latitude` and `longitude` inputs (editable before saving)
  - On failure (empty result or network error): shows inline error "找不到座標，請手動輸入"

**Geocoding API call:**
```
GET https://nominatim.openstreetmap.org/search
  ?q={encodeURIComponent(address)}
  &format=json
  &limit=1
  &countrycodes=tw
  &accept-language=zh-TW
```

`countrycodes=tw` restricts results to Taiwan, improving accuracy for Chinese-language addresses.

Response: `[{ lat: "25.037...", lon: "121.564..." }]`

---

## File Change Summary

| File | Change |
|------|--------|
| `src/app/models/index.ts` | Add `VenueRegionFilter` type; add optional `latitude?`, `longitude?` to `Venue` |
| `src/app/pages/home/home.component.ts` | Remove local `VenueRegionFilter` type; add `@ViewChild`; wire popup refresh |
| `supabase/migrations/*_venues_add_coords.sql` | New migration file |
| `src/app/shared/venue-map/venue-map.component.ts` | New component |
| `src/app/shared/venue-map/venue-map.component.css` | New styles |
| `src/app/pages/home/home.component.html` | Add `<app-venue-map>`, reposition filter buttons |
| `src/app/pages/admin/admin-venues/admin-venues.component.html` | Add lat/lng fields + geocoding button |
| `src/app/pages/admin/admin-venues/admin-venues.component.ts` | Add geocoding logic |
| `angular.json` | Add `node_modules/leaflet/dist/leaflet.css` to styles array |
| `package.json` | Add `leaflet`, `@types/leaflet` |

---

## Out of Scope

- Backfilling coordinate data (done manually in Supabase after migration)
- Marker clustering
- Runtime geocoding for public users
- Directions / routing
- Switching to a paid tile provider (revisit if OSM tile usage becomes an issue)
