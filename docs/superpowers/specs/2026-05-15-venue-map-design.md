# Venue Interactive Map — Design Spec

**Date:** 2026-05-15
**Status:** Approved

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

Leaflet native popup with HTML content:
- Venue name (bold)
- Address + copy button
- Type badge (if present)
- Upcoming events list — reads from home component's existing `venueEvents` Map
  - If not yet loaded: shows "讀取中…"
  - If no events: shows "目前沒有近期活動"
- Google Maps link (if `google_maps_url` present)
- Click outside popup to close

### Mobile

- Map height: `400px` on desktop, `260px` on `≤640px` screens
- Popup max-width: `280px`

---

## Data Layer

### DB Migration

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
  latitude:  number | null;
  longitude: number | null;
}
```

`VenueService.getAll()` requires no changes — `select('*')` picks up new columns automatically.

---

## Components

### New: `VenueMapComponent`

**Path:** `src/app/shared/venue-map/venue-map.component.ts`

**Inputs:**
```typescript
@Input() venues: Venue[] = [];
@Input() activeRegion: VenueRegionFilter = 'all';
@Input() venueEvents: Map<string, VenueCalendarEvent[]> = new Map();
@Input() venueEventsLoaded: Set<string> = new Set();
@Input() venueEventsLoading: Set<string> = new Set();
@Input() venueEventsError: Map<string, string> = new Map();
```

**Outputs:**
```typescript
@Output() regionChange = new EventEmitter<VenueRegionFilter>();
@Output() venuePopupOpened = new EventEmitter<string>(); // emits venue.id
```

**Responsibilities:**
- Initialize Leaflet map (browser-only, dynamic import)
- Render colored `divIcon` markers for venues with coordinates
- Show/hide markers based on `activeRegion` input changes
- Call `map.fitBounds()` when markers update
- On marker click: open Leaflet popup, emit `venuePopupOpened` with `venue.id` so home component triggers event loading (same path as `toggleVenue`)
- Render popup HTML using `venueEvents` / `venueEventsLoading` / `venueEventsError` inputs; re-render popup content when inputs change via `ngOnChanges`

### Modified: `HomeComponent`

- Import and add `<app-venue-map>` inside the venues tab panel, above filter buttons
- Move filter button section below map, add label "區域篩選 — 同步過濾地圖與列表"
- Pass `venues`, `activeVenueRegionFilter`, `venueEvents`, `venueEventsLoaded`, `venueEventsLoading`, `venueEventsError` as inputs
- Handle `(regionChange)` output to update `activeVenueRegionFilter`
- Handle `(venuePopupOpened)` output: call existing event-loading logic (same as `toggleVenue`) for that venue id

### Modified: `AdminVenuesComponent`

**New fields in venue create/edit form:**
- `latitude`: number input, optional, label "緯度 (Latitude)"
- `longitude`: number input, optional, label "經度 (Longitude)"
- "自動帶入座標" button:
  - Disabled until `address` field has a value
  - On click: `fetch` Nominatim geocoding API
  - Shows loading spinner while fetching
  - On success: fills `latitude` and `longitude` inputs (user can adjust before saving)
  - On failure: shows inline error "找不到座標，請手動輸入"

**Geocoding API call:**
```
GET https://nominatim.openstreetmap.org/search
  ?q={address}
  &format=json
  &limit=1
  &accept-language=zh-TW
```

Response: `[{ lat: "25.037...", lon: "121.564..." }]`

---

## File Change Summary

| File | Change |
|------|--------|
| `src/app/models/index.ts` | Add `latitude`, `longitude` to `Venue` interface |
| `src/app/shared/venue-map/venue-map.component.ts` | New component |
| `src/app/shared/venue-map/venue-map.component.css` | New styles |
| `src/app/pages/home/home.component.html` | Add `<app-venue-map>`, reposition filter buttons |
| `src/app/pages/home/home.component.ts` | Import `VenueMapComponent`, wire inputs/outputs |
| `src/app/pages/admin/admin-venues/admin-venues.component.html` | Add lat/lng fields + geocoding button |
| `src/app/pages/admin/admin-venues/admin-venues.component.ts` | Add geocoding logic |
| `package.json` | Add `leaflet`, `@types/leaflet` |

---

## Out of Scope

- Backfilling coordinate data (done manually in Supabase)
- Marker clustering
- Runtime geocoding for public users
- Directions / routing
