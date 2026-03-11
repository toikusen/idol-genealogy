import { TestBed } from '@angular/core/testing';
import { AdminRoleService } from './admin-role.service';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';

describe('AdminRoleService', () => {
  let service: AdminRoleService;
  let dbSpy: jasmine.SpyObj<any>;
  let authState$: BehaviorSubject<any>;

  beforeEach(() => {
    authState$ = new BehaviorSubject<any>(null);
    dbSpy = {
      from: jasmine.createSpy('from'),
    };

    TestBed.configureTestingModule({
      providers: [
        AdminRoleService,
        {
          provide: SupabaseService,
          useValue: { client: dbSpy, authState$, getSessionOnce: jasmine.createSpy('getSessionOnce') }
        }
      ]
    });
    service = TestBed.inject(AdminRoleService);
  });

  it('isAdmin$ starts as false before any auth event', () => {
    let val: boolean | undefined;
    service.isAdmin$.subscribe(v => val = v).unsubscribe();
    expect(val).toBeFalse();
  });

  it('isAdmin$ becomes true when authState$ emits a session and user is admin', async () => {
    const supabase = TestBed.inject(SupabaseService) as any;
    const eqEmailSpy = jasmine.createSpy('eqEmail').and.returnValue({
      eq: jasmine.createSpy('eqRole').and.returnValue({
        limit: jasmine.createSpy('limit').and.returnValue(
          Promise.resolve({ data: [{ id: '1' }], error: null })
        )
      })
    });
    dbSpy.from.and.returnValue({ select: jasmine.createSpy().and.returnValue({ eq: eqEmailSpy }) });
    supabase.getSessionOnce.and.returnValue(Promise.resolve({ user: { email: 'admin@test.com' } }));
    authState$.next({ user: { email: 'admin@test.com' } });
    await new Promise(r => setTimeout(r, 10)); // let the async subscribe settle
    let val: boolean | undefined;
    service.isAdmin$.subscribe(v => val = v).unsubscribe();
    expect(val).toBeTrue();
  });

  it('isAdmin$ resets to false when authState$ emits null (logout)', async () => {
    authState$.next(null);
    let val: boolean | undefined;
    service.isAdmin$.subscribe(v => val = v).unsubscribe();
    expect(val).toBeFalse();
  });

  it('isAdmin() returns false when current user is not in user_roles', async () => {
    const supabase = TestBed.inject(SupabaseService) as any;
    supabase.getSessionOnce.and.returnValue(Promise.resolve({ user: { email: 'user@test.com' } }));
    const limitSpy = jasmine.createSpy('limit').and.returnValue(Promise.resolve({ data: [], error: null }));
    const eqRoleSpy = jasmine.createSpy('eqRole').and.returnValue({ limit: limitSpy });
    const eqEmailSpy = jasmine.createSpy('eqEmail').and.returnValue({ eq: eqRoleSpy });
    dbSpy.from.and.returnValue({ select: jasmine.createSpy().and.returnValue({ eq: eqEmailSpy }) });
    const result = await service.isAdmin();
    expect(result).toBeFalse();
  });

  it('isAdmin() returns true when current user has admin role', async () => {
    const supabase = TestBed.inject(SupabaseService) as any;
    supabase.getSessionOnce.and.returnValue(Promise.resolve({ user: { email: 'admin@test.com' } }));
    const limitSpy = jasmine.createSpy('limit').and.returnValue(
      Promise.resolve({ data: [{ id: '1' }], error: null })
    );
    const eqRoleSpy = jasmine.createSpy('eqRole').and.returnValue({ limit: limitSpy });
    const eqEmailSpy = jasmine.createSpy('eqEmail').and.returnValue({ eq: eqRoleSpy });
    dbSpy.from.and.returnValue({ select: jasmine.createSpy().and.returnValue({ eq: eqEmailSpy }) });
    const result = await service.isAdmin();
    expect(result).toBeTrue();
  });

  it('getAll() returns user_roles list', async () => {
    const roles = [{ id: '1', email: 'a@b.com', role: 'admin', created_at: '' }];
    const fromChain = {
      select: jasmine.createSpy().and.returnValue({ data: roles, error: null })
    };
    dbSpy.from.and.returnValue(fromChain);
    const result = await service.getAll();
    expect(result).toEqual(roles as any);
  });

  it('add() inserts a new user_role', async () => {
    const fromChain = {
      insert: jasmine.createSpy().and.returnValue(Promise.resolve({ error: null }))
    };
    dbSpy.from.and.returnValue(fromChain);
    await expectAsync(service.add('new@test.com', 'editor')).toBeResolved();
    expect(fromChain.insert).toHaveBeenCalledWith({ email: 'new@test.com', role: 'editor' });
  });

  it('remove() deletes a user_role by id', async () => {
    const eqSpy = jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }));
    const fromChain = {
      delete: jasmine.createSpy().and.returnValue({ eq: eqSpy })
    };
    dbSpy.from.and.returnValue(fromChain);
    await expectAsync(service.remove('role-id-1')).toBeResolved();
    expect(eqSpy).toHaveBeenCalledWith('id', 'role-id-1');
  });

  it('isAdmin() returns false when session is null', async () => {
    const supabase = TestBed.inject(SupabaseService) as any;
    supabase.getSessionOnce.and.returnValue(Promise.resolve(null));
    const result = await service.isAdmin();
    expect(result).toBeFalse();
  });

  it('isAdmin() returns false when Supabase returns an error', async () => {
    const supabase = TestBed.inject(SupabaseService) as any;
    supabase.getSessionOnce.and.returnValue(Promise.resolve({ user: { email: 'a@b.com' } }));
    const limitSpy = jasmine.createSpy('limit').and.returnValue(
      Promise.resolve({ data: null, error: { message: 'db error' } })
    );
    const eqRoleSpy = jasmine.createSpy('eqRole').and.returnValue({ limit: limitSpy });
    const eqEmailSpy = jasmine.createSpy('eqEmail').and.returnValue({ eq: eqRoleSpy });
    dbSpy.from.and.returnValue({ select: jasmine.createSpy().and.returnValue({ eq: eqEmailSpy }) });
    const result = await service.isAdmin();
    expect(result).toBeFalse();
  });

  it('getAll() throws when Supabase returns an error', async () => {
    const fromChain = {
      select: jasmine.createSpy().and.returnValue({ data: null, error: { message: 'fetch error' } })
    };
    dbSpy.from.and.returnValue(fromChain);
    await expectAsync(service.getAll()).toBeRejected();
  });

  it('add() throws when Supabase returns an error', async () => {
    const fromChain = {
      insert: jasmine.createSpy().and.returnValue(Promise.resolve({ error: { message: 'insert error' } }))
    };
    dbSpy.from.and.returnValue(fromChain);
    await expectAsync(service.add('x@y.com', 'editor')).toBeRejected();
  });

  it('remove() throws when Supabase returns an error', async () => {
    const eqSpy = jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: { message: 'delete error' } }));
    const fromChain = {
      delete: jasmine.createSpy().and.returnValue({ eq: eqSpy })
    };
    dbSpy.from.and.returnValue(fromChain);
    await expectAsync(service.remove('role-id-1')).toBeRejected();
  });
});
