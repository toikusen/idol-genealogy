import { Component, ElementRef, NgZone, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';
import { VenueService } from '../../core/venue.service';
import { Venue } from '../../models';
import { environment } from '../../../environments/environment';

export const PLAN_MAX_BYTES = 15 * 1024 * 1024;
const PLAN_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Client-side check for a quick answer; the edge function re-checks the real bytes. */
export function checkPlanFile(f: { size: number; type: string }): string | null {
  if (!PLAN_TYPES.includes(f.type)) return '只接受 JPG、PNG、WebP 圖片或 PDF';
  if (f.size > PLAN_MAX_BYTES) return '檔案超過 15MB，請壓縮後再上傳';
  if (f.size === 0) return '這個檔案是空的';
  return null;
}

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
}

@Component({
  selector: 'app-plan-upload',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './plan-upload.component.html',
  styleUrl: './plan-upload.component.css',
})
export class PlanUploadComponent implements OnInit {
  venues: Venue[] = [];
  venueId = '';
  file: File | null = null;
  knownDimension = '';
  sourceUrl = '';
  email = '';
  note = '';
  licenseAck = false;
  state: 'idle' | 'sending' | 'done' = 'idle';
  error = '';
  token = '';
  readonly needsTurnstile = !!environment.turnstileSiteKey;

  @ViewChild('turnstile') turnstileEl?: ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  private widgetId = '';
  private readonly zone = inject(NgZone);

  constructor(
    private route: ActivatedRoute,
    private seo: SeoService,
    private venueService: VenueService,
  ) {}

  async ngOnInit() {
    this.seo.setPage(
      '上傳場館平面圖 | Idol Maps',
      '上傳 live house 的官方平面圖，審核後用來製作「別擋我推」的 3D 視線模擬。',
      siteUrl('/upload-plan'),
    );
    this.seo.setRobotsNoIndex(true);
    if (typeof window === 'undefined') return;
    this.venues = [...(await this.venueService.getAll())].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    const wanted = this.route.snapshot.queryParamMap.get('venue');
    if (wanted && this.venues.some(v => v.id === wanted)) this.venueId = wanted;
    if (this.needsTurnstile) this.loadTurnstile();
  }

  get canSubmit(): boolean {
    return !!this.venueId && !!this.file && this.licenseAck && (!this.needsTurnstile || !!this.token) && this.state !== 'sending';
  }

  onFile(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.error = f ? checkPlanFile(f) ?? '' : '';
    this.file = f && !this.error ? f : null;
  }

  async submit() {
    if (!this.canSubmit || !this.file) return;
    this.state = 'sending';
    this.error = '';
    const fd = new FormData();
    fd.append('venue_id', this.venueId);
    fd.append('file', this.file);
    fd.append('known_dimension', this.knownDimension);
    fd.append('source_url', this.sourceUrl);
    fd.append('contact_email', this.email);
    fd.append('note', this.note);
    fd.append('license_ack', '1');
    if (this.token) fd.append('cf-turnstile-response', this.token);
    try {
      const res = await fetch(`${environment.supabaseUrl}/functions/v1/venue-plan-upload`, {
        method: 'POST',
        headers: { apikey: environment.supabaseAnonKey, Authorization: `Bearer ${environment.supabaseAnonKey}` },
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { this.state = 'done'; return; }
      this.error = body.error ?? '上傳失敗，請稍後再試';
    } catch {
      this.error = '網路連線失敗，請稍後再試';
    }
    this.state = 'idle';
    this.resetTurnstile();
  }

  again() {
    this.file = null;
    this.knownDimension = this.sourceUrl = this.note = '';
    this.state = 'idle';
    if (this.fileInput) this.fileInput.nativeElement.value = '';
    setTimeout(() => this.renderTurnstile());   // the widget's element is re-created with the form
  }

  get venueName(): string {
    return this.venues.find(v => v.id === this.venueId)?.name ?? '';
  }

  private loadTurnstile() {
    const w = window as unknown as { turnstile?: TurnstileApi; onTurnstileLoad?: () => void };
    if (w.turnstile) { setTimeout(() => this.renderTurnstile()); return; }
    w.onTurnstileLoad = () => this.renderTurnstile();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
    s.async = true;
    document.head.appendChild(s);
  }

  private renderTurnstile() {
    const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    const el = this.turnstileEl?.nativeElement;
    if (!api || !el) return;
    el.textContent = '';
    this.token = '';
    this.widgetId = api.render(el, {
      sitekey: environment.turnstileSiteKey,
      language: 'zh-tw',
      callback: (t: string) => this.zone.run(() => { this.token = t; }),
      'expired-callback': () => this.zone.run(() => { this.token = ''; }),
    });
  }

  private resetTurnstile() {
    const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    if (api && this.widgetId) { api.reset(this.widgetId); this.token = ''; }
  }
}
