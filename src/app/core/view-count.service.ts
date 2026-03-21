import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class ViewCountService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor(private supabase: SupabaseService) {}

  async increment(type: 'member' | 'group', id: string): Promise<void> {
    if (!this.isBrowser) return;
    await this.supabase.client.rpc('increment_view', { p_type: type, p_id: id });
    // Note: { error } in the resolved value is ignored here (non-critical).
    // If the rpc call itself rejects (network error), the rejection propagates to the caller,
    // which is expected to call .catch(() => {}) at the call site.
  }
}
