import { Injectable, OnDestroy } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

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
      }
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
    return this.client.auth.signInWithOAuth({ provider: 'google' }).then(() => {});
  }

  signOut(): Promise<void> {
    return this.client.auth.signOut().then(() => {});
  }
}
