import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VenueService } from '../../../core/venue.service';
import { Venue } from '../../../models';

type RegionKey = 'north' | 'central' | 'south';
type RegionFilterKey = RegionKey | 'all';

interface VenueDraft {
  name: string;
  address: string;
  type: string;
  region: RegionKey;
  google_maps_url: string;
  phone: string;
  notes: string;
  latitude:  number | null;
  longitude: number | null;
}

const emptyDraft = (): VenueDraft => ({
  name: '', address: '', type: '', region: 'north',
  google_maps_url: '', phone: '', notes: '',
  latitude: null, longitude: null,
});

@Component({
  selector: 'app-admin-venues',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-venues.component.html',
})
export class AdminVenuesComponent implements OnInit {
  venues: Venue[] = [];
  loading = true;
  error = '';
  showModal = false;
  editingId: string | null = null;
  draft: VenueDraft = emptyDraft();
  saving = false;
  geocoding = false;
  geocodeError = '';
  venueFilterText = '';
  activeRegionFilter: RegionFilterKey = 'all';

  readonly regionLabels: Record<RegionKey, string> = {
    north: '北部', central: '中部', south: '南部',
  };

  readonly regionFilters: { key: RegionFilterKey; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'north', label: '北部' },
    { key: 'central', label: '中部' },
    { key: 'south', label: '南部' },
  ];

  readonly venueTypeOptions = ['Live House', '展演空間', '大型場館', '展覽館', '劇場'];

  constructor(private venueService: VenueService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      this.venues = await this.venueService.getForAdmin();
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  get filteredVenues(): Venue[] {
    const keyword = this.normalizeFilterText(this.venueFilterText);
    return this.venues.filter(venue => {
      const matchesRegion = this.activeRegionFilter === 'all' || venue.region === this.activeRegionFilter;
      if (!matchesRegion) return false;
      if (!keyword) return true;

      return this.normalizeFilterText([
        venue.name,
        venue.address,
        venue.type,
        venue.phone,
        venue.notes,
      ].filter(Boolean).join(' ')).includes(keyword);
    });
  }

  get hasActiveFilter(): boolean {
    return this.activeRegionFilter !== 'all' || this.venueFilterText.trim().length > 0;
  }

  setRegionFilter(filter: RegionFilterKey) {
    this.activeRegionFilter = filter;
  }

  clearFilters() {
    this.venueFilterText = '';
    this.activeRegionFilter = 'all';
  }

  openAdd() {
    this.draft = emptyDraft();
    this.editingId = null;
    this.showModal = true;
  }

  openEdit(v: Venue) {
    this.draft = {
      name: v.name,
      address: v.address,
      type: v.type ?? '',
      region: v.region,
      google_maps_url: v.google_maps_url ?? '',
      phone: v.phone ?? '',
      notes: v.notes ?? '',
      latitude:  v.latitude  ?? null,
      longitude: v.longitude ?? null,
    };
    this.editingId = v.id;
    this.showModal = true;
  }

  cancelForm() {
    this.showModal = false;
    this.editingId = null;
    this.draft = emptyDraft();
    this.error = '';
    this.geocodeError = '';
  }

  async save() {
    if (!this.draft.name.trim() || !this.draft.address.trim()) {
      this.error = '名稱與地址為必填欄位';
      return;
    }
    this.saving = true;
    this.error = '';
    try {
      const payload = {
        name: this.draft.name.trim(),
        address: this.draft.address.trim(),
        type: this.draft.type.trim() || null,
        region: this.draft.region,
        google_maps_url: this.draft.google_maps_url.trim() || null,
        phone: this.draft.phone.trim() || null,
        notes: this.draft.notes.trim() || null,
        latitude:  this.draft.latitude,
        longitude: this.draft.longitude,
      };
      if (this.editingId) {
        await this.venueService.update(this.editingId, payload);
      } else {
        await this.venueService.create({ ...payload, is_active: true });
      }
      this.showModal = false;
      this.editingId = null;
      await this.load();
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : '儲存失敗';
    } finally {
      this.saving = false;
    }
  }

  async geocodeAddress(): Promise<void> {
    if (this.geocoding) return;
    this.geocoding = true;
    this.geocodeError = '';
    try {
      // 1. Try parsing coordinates directly from the Google Maps URL
      const fromUrl = this.parseGoogleMapsCoords(this.draft.google_maps_url);
      if (fromUrl) {
        this.draft.latitude  = fromUrl.lat;
        this.draft.longitude = fromUrl.lng;
        return;
      }

      // 2. Fall back to Nominatim if address is provided
      if (!this.draft.address.trim()) {
        this.geocodeError = '請填入地址，或將 Google Maps 完整網址（瀏覽器地址列）貼入「Google Maps 連結」欄位後再試';
        return;
      }
      const queryAddress = this.draft.address.replace(/^\d{3,6}\s*/, '').trim();
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryAddress)}&format=json&limit=1&countrycodes=tw&accept-language=zh-TW`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'zh-TW' } });
      const data = await res.json() as { lat: string; lon: string }[];
      if (!data.length) {
        this.geocodeError = '自動查詢失敗。請在 Google Maps 找到場地後，從瀏覽器地址列複製完整網址（含 @lat,lng）貼入「Google Maps 連結」欄位，再點此按鈕。';
        return;
      }
      this.draft.latitude  = parseFloat(data[0].lat);
      this.draft.longitude = parseFloat(data[0].lon);
    } catch {
      this.geocodeError = '查詢失敗，請檢查網路連線';
    } finally {
      this.geocoding = false;
    }
  }

  private parseGoogleMapsCoords(url: string): { lat: number; lng: number } | null {
    if (!url) return null;
    // https://www.google.com/maps/place/.../@lat,lng,zoom
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
    if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    // ?q=lat,lng or &q=lat,lng
    const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    // ?ll=lat,lng (older format)
    const llMatch = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (llMatch) return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
    return null;
  }

  async delete(v: Venue) {
    if (!confirm(`確定刪除「${v.name}」？`)) return;
    try {
      await this.venueService.delete(v.id);
      await this.load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '刪除失敗');
    }
  }

  private normalizeFilterText(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '');
  }
}
