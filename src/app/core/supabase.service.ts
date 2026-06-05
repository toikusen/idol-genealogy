import { Injectable, OnDestroy } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

const serverRealtimeTransport = class {
  constructor() {
    throw new Error('Supabase realtime is not available during server prerendering.');
  }
} as unknown as typeof WebSocket;

@Injectable({ providedIn: 'root' })
export class SupabaseService implements OnDestroy {
  private readonly isBrowser = typeof window !== 'undefined';

  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: this.isBrowser,
        detectSessionInUrl: this.isBrowser,
        persistSession: this.isBrowser,
        // Bypass Navigator.locks to prevent "lock immediately failed" console errors
        // during Angular hydration when two async paths race on the same lock.
        // The null-session risk this creates is mitigated by using the
        // insert_approved_proposal RPC (which reads auth.uid() from the JWT directly)
        // instead of a direct proposals table INSERT.
        lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
      },
      ...(this.isBrowser ? {} : { realtime: { transport: serverRealtimeTransport } }),
    }
  );

  private _authState = new BehaviorSubject<Session | null>(null);
  readonly authState$ = this._authState.asObservable();
  private _authSubscription: { unsubscribe: () => void } | null = null;

  constructor() {
    if (!this.isBrowser) return;
    this.client.auth.getSession().then(({ data }) => {
      this._authState.next(data.session);
    });
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      this._authState.next(session);
    });
    this._authSubscription = data.subscription;
  }

  ngOnDestroy(): void {
    this._authSubscription?.unsubscribe();
  }

  /** Resolves with the current session after getSession() has returned (avoids cold-start race). */
  getSessionOnce(): Promise<Session | null> {
    return this.client.auth.getSession().then(({ data }) => data.session);
  }

  signInWithGoogle(): Promise<void> {
    const redirectTo = this.isBrowser
      ? `${window.location.origin}/login`
      : undefined;
    return this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    }).then(() => {});
  }

  signOut(): Promise<void> {
    return this.client.auth.signOut().then(() => {});
  }
}
