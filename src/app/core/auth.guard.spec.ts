import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let routerSpy: jasmine.SpyObj<Router>;
  let authState$: BehaviorSubject<any>;

  beforeEach(() => {
    authState$ = new BehaviorSubject(null);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: Router, useValue: routerSpy },
        { provide: SupabaseService, useValue: { authState$ } }
      ]
    });
    guard = TestBed.inject(AuthGuard);
  });

  it('should be created', () => expect(guard).toBeTruthy());

  it('should block unauthenticated users and navigate to /login', async () => {
    authState$.next(null);
    const result = await guard.canActivate(null as any, { url: '/admin' } as any);
    expect(result).toBeFalse();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/admin' } });
  });

  it('should allow authenticated users', async () => {
    authState$.next({ user: { id: 'uid-1' } });
    const result = await guard.canActivate(null as any, { url: '/admin' } as any);
    expect(result).toBeTrue();
  });
});
