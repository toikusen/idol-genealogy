import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { UserRole } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminRoleService implements OnDestroy {
  private _isAdmin = new BehaviorSubject<boolean>(false);
  readonly isAdmin$ = this._isAdmin.asObservable();
  private _sub: Subscription;

  constructor(private supabase: SupabaseService) {
    // Re-check admin status whenever auth state changes
    this._sub = this.supabase.authState$.subscribe(session => {
      if (session) {
        this.isAdmin().then(val => this._isAdmin.next(val));
      } else {
        this._isAdmin.next(false);
      }
    });
  }

  ngOnDestroy(): void {
    this._sub.unsubscribe();
  }

  /** Check if the currently logged-in user has role='admin' in user_roles. */
  async isAdmin(): Promise<boolean> {
    const session = await this.supabase.getSessionOnce();
    if (!session?.user?.email) return false;
    const { data, error } = await this.supabase.client
      .from('user_roles')
      .select('id')
      .eq('email', session.user.email)
      .eq('role', 'admin')
      .limit(1);
    if (error || !data) return false;
    return data.length > 0;
  }

  async getAll(): Promise<UserRole[]> {
    const { data, error } = await this.supabase.client
      .from('user_roles')
      .select('*');
    if (error) throw error;
    return data ?? [];
  }

  async add(email: string, role: 'admin' | 'editor'): Promise<void> {
    const { error } = await this.supabase.client
      .from('user_roles')
      .insert({ email, role });
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('user_roles')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
