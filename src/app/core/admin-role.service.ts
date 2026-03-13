import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { UserRole } from '../models';

export const SUPERADMIN_EMAIL = 'tuyucheng0407@gmail.com';

@Injectable({ providedIn: 'root' })
export class AdminRoleService implements OnDestroy {
  private _isAdmin = new BehaviorSubject<boolean>(false);
  readonly isAdmin$ = this._isAdmin.asObservable();
  private _sub: Subscription;

  constructor(private supabase: SupabaseService) {
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

  /** 系統管理員（寫死 email） */
  async isSuperAdmin(): Promise<boolean> {
    const session = await this.supabase.getSessionOnce();
    return session?.user?.email === SUPERADMIN_EMAIL;
  }

  /** admin 或 superadmin 皆視為有管理權限 */
  async isAdmin(): Promise<boolean> {
    const session = await this.supabase.getSessionOnce();
    if (!session?.user?.email) return false;
    if (session.user.email === SUPERADMIN_EMAIL) return true;
    const { data, error } = await this.supabase.client
      .from('user_roles')
      .select('id')
      .eq('email', session.user.email)
      .in('role', ['admin', 'superadmin'])
      .limit(1);
    if (error || !data) return false;
    return data.length > 0;
  }

  async getAll(): Promise<UserRole[]> {
    const { data, error } = await this.supabase.client
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async add(email: string, role: 'admin' | 'editor', displayName?: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('user_roles')
      .insert({ email, role, display_name: displayName || null });
    if (error) throw error;
  }

  async update(id: string, displayName: string | null, role?: 'admin' | 'editor' | 'superadmin'): Promise<void> {
    const payload: any = { display_name: displayName };
    if (role !== undefined) payload['role'] = role;
    const { error } = await this.supabase.client
      .from('user_roles')
      .update(payload)
      .eq('id', id);
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
