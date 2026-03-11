import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey
  );

  private _authState = new BehaviorSubject<Session | null>(null);
  readonly authState$ = this._authState.asObservable();

  constructor() {
    this.client.auth.getSession().then(({ data }) => {
      this._authState.next(data.session);
    });
    this.client.auth.onAuthStateChange((_event, session) => {
      this._authState.next(session);
    });
  }

  signInWithGoogle(): Promise<void> {
    return this.client.auth.signInWithOAuth({ provider: 'google' }).then(() => {});
  }

  signOut(): Promise<void> {
    return this.client.auth.signOut().then(() => {});
  }
}
