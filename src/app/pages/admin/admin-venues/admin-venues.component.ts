import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VenueService } from '../../../core/venue.service';
import { Venue } from '../../../models';

type RegionKey = 'north' | 'central' | 'south';

interface VenueDraft {
  name: string;
  address: string;
  type: string;
  region: RegionKey;
  google_maps_url: string;
  phone: string;
  notes: string;
}

const emptyDraft = (): VenueDraft => ({
  name: '', address: '', type: '', region: 'north',
  google_maps_url: '', phone: '', notes: '',
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

  readonly regionLabels: Record<RegionKey, string> = {
    north: '北部', central: '中部', south: '南部',
  };

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
    };
    this.editingId = v.id;
    this.showModal = true;
  }

  cancelForm() {
    this.showModal = false;
    this.editingId = null;
    this.draft = emptyDraft();
    this.error = '';
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

  async delete(v: Venue) {
    if (!confirm(`確定刪除「${v.name}」？`)) return;
    try {
      await this.venueService.delete(v.id);
      await this.load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '刪除失敗');
    }
  }
}
