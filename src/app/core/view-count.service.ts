import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_TOKEN_KEY = 'view_session_token';

function viewedKey(type: 'member' | 'group', id: string): string {
  return `viewed_${type}_${id}`;
}

@Injectable({ providedIn: 'root' })
export class ViewCountService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private sessionToken: string | null = null;

  constructor(private supabase: SupabaseService) {}

  // Browser-only: called only after isBrowser guard in increment()
  private getSessionToken(): string {
    if (this.sessionToken) return this.sessionToken;
    let token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    this.sessionToken = token;
    return token;
  }

  // Browser-only: called only after isBrowser guard in increment()
  private isOnCooldown(type: 'member' | 'group', id: string): boolean {
    const raw = localStorage.getItem(viewedKey(type, id));
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) < COOLDOWN_MS;
  }

  // Browser-only: called only after isBrowser guard in increment()
  private markViewed(type: 'member' | 'group', id: string): void {
    localStorage.setItem(viewedKey(type, id), String(Date.now()));
  }

  async increment(type: 'member' | 'group', id: string): Promise<void> {
    if (!this.isBrowser) return;
    if (this.isOnCooldown(type, id)) return;

    await this.supabase.client.rpc('increment_view', {
      p_type: type,
      p_id: id,
      p_session_token: this.getSessionToken()
    });
    // Write timestamp unconditionally — whether the DB skipped or incremented,
    // we want the frontend to avoid redundant calls during the cooldown window.
    // If the RPC rejects (network error), the rejection propagates to the caller
    // and markViewed is not called, so the next load will retry the RPC.
    this.markViewed(type, id);
  }
}
