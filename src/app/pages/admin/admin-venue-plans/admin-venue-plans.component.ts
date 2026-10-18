import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/supabase.service';

export interface VenuePlanRow {
  id: string;
  venue_id: string;
  storage_path: string;
  mime: string;
  size_bytes: number;
  known_dimension: string | null;
  source_url: string | null;
  contact_email: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  venues: { name: string } | null;
  url?: string;
  rejectDraft?: string;
}

export interface ViewFeedbackRow {
  id: string;
  venue: string;
  category: 'venue' | 'idea' | 'bug' | 'other';
  message: string;
  contact: string | null;
  page_state: string | null;
  status: 'new' | 'done';
  created_at: string;
}

export const FEEDBACK_LABELS: Record<ViewFeedbackRow['category'], string> = {
  venue: '場地跟現況不同', idea: '功能建議', bug: '畫面或計算有問題', other: '其他',
};

/** Only links back into the 別擋我推 page are rendered as links: page_state is user-supplied. */
export const safeViewLink = (s: string | null) => (s && /^https:\/\/idolmaps\.com\/view#/.test(s) ? s : null);

/** Uploaded floor plans (anonymous, via the venue-plan-upload edge function): approve for 3D modelling or reject. */
@Component({
  selector: 'app-admin-venue-plans',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-venue-plans.component.html',
})
export class AdminVenuePlansComponent implements OnInit {
  rows: VenuePlanRow[] = [];
  loading = true;
  error = '';
  busyId = '';
  feedback: ViewFeedbackRow[] = [];
  readonly feedbackLabels = FEEDBACK_LABELS;
  readonly viewLink = safeViewLink;

  constructor(private supabase: SupabaseService) {}

  private get db() { return this.supabase.client; }

  get pending() { return this.rows.filter(r => r.status === 'pending'); }
  get reviewed() { return this.rows.filter(r => r.status !== 'pending'); }
  get newFeedback() { return this.feedback.filter(f => f.status === 'new'); }
  get doneFeedback() { return this.feedback.filter(f => f.status === 'done'); }

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    this.error = '';
    const { data, error } = await this.db.from('venue_plans')
      .select('*, venues(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { this.error = error.message; this.loading = false; return; }
    // feedback from the /view page (view-feedback edge function, migration 118)
    const fb = await this.db.from('view_feedback')
      .select('id, venue, category, message, contact, page_state, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (fb.error) this.error = fb.error.message;
    this.feedback = (fb.data ?? []) as ViewFeedbackRow[];
    this.rows = (data ?? []) as VenuePlanRow[];
    if (this.rows.length) {
      // private bucket: short-lived links, only for admins (storage policy in migration 117)
      const { data: urls } = await this.db.storage.from('venue-plans')
        .createSignedUrls(this.rows.map(r => r.storage_path), 60 * 30);
      const byPath = new Map((urls ?? []).map(u => [u.path, u.signedUrl]));
      this.rows.forEach(r => { r.url = byPath.get(r.storage_path) ?? undefined; });
    }
    this.loading = false;
  }

  isImage(r: VenuePlanRow) { return r.mime.startsWith('image/'); }
  sizeMb(r: VenuePlanRow) { return (r.size_bytes / 1048576).toFixed(1); }

  async review(r: VenuePlanRow, status: 'approved' | 'rejected') {
    if (status === 'rejected' && !r.rejectDraft?.trim()) { this.error = '請填退回原因'; return; }
    this.busyId = r.id;
    this.error = '';
    const { data: { user } } = await this.db.auth.getUser();
    const { error } = await this.db.from('venue_plans').update({
      status,
      reject_reason: status === 'rejected' ? r.rejectDraft!.trim().slice(0, 300) : null,
      reviewed_by: user?.email ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', r.id);
    this.busyId = '';
    if (error) { this.error = error.message; return; }
    await this.load();
  }

  async setFeedbackStatus(f: ViewFeedbackRow, status: ViewFeedbackRow['status']) {
    this.busyId = f.id;
    this.error = '';
    const { error } = await this.db.from('view_feedback').update({ status }).eq('id', f.id);
    this.busyId = '';
    if (error) { this.error = error.message; return; }
    f.status = status;
  }
}
