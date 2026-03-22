import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { UserRole } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminRoleService implements OnDestroy {
  private _isAdmin = new BehaviorSubject<boolean>(false);
  readonly isAdmin$ = this._isAdmin.asObservable();
  private _sub: Subscription;
  private _cachedUserId: string | null = null;
  private _cachedIsAdmin: boolean | null = null;
  private _inflightIsAdmin: Promise<boolean> | null = null;

  constructor(private supabase: SupabaseService) {
    this._sub = this.supabase.authState$.subscribe(session => {
      if (session) {
        const userId = session.user.id;
        if (this._cachedUserId === userId && this._cachedIsAdmin !== null) {
          this._isAdmin.next(this._cachedIsAdmin);
          return;
        }
        this.isAdmin().then(val => this._isAdmin.next(val));
      } else {
        this._cachedUserId = null;
        this._cachedIsAdmin = null;
        this._inflightIsAdmin = null;
        this._isAdmin.next(false);
      }
    });
  }

  ngOnDestroy(): void {
    this._sub.unsubscribe();
  }

  /** 系統管理員（role = 'superadmin'） */
  async isSuperAdmin(): Promise<boolean> {
    const session = await this.supabase.getSessionOnce();
    if (!session?.user?.email) return false;
    const { data, error } = await this.supabase.client
      .from('user_roles')
      .select('id')
      .eq('email', session.user.email)
      .eq('role', 'superadmin')
      .limit(1);
    if (error || !data) return false;
    return data.length > 0;
  }

  /** admin 或 superadmin 皆視為有管理權限 */
  isAdmin(): Promise<boolean> {
    if (this._inflightIsAdmin) return this._inflightIsAdmin;
    if (this._cachedUserId !== null && this._cachedIsAdmin !== null) {
      return Promise.resolve(this._cachedIsAdmin);
    }
    this._inflightIsAdmin = this.supabase.getSessionOnce().then(async session => {
      if (!session?.user?.email) return false;
      const { data, error } = await this.supabase.client
        .from('user_roles')
        .select('id')
        .eq('email', session.user.email)
        .in('role', ['admin', 'superadmin'])
        .limit(1);
      if (error || !data) return false;
      const result = data.length > 0;
      this._cachedUserId = session.user.id;
      this._cachedIsAdmin = result;
      this._inflightIsAdmin = null;
      return result;
    });
    return this._inflightIsAdmin;
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
