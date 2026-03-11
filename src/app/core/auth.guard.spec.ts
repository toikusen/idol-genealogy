import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';

describe('authGuard', () => {
  let routerSpy: jasmine.SpyObj<Router>;
  let authState$: BehaviorSubject<any>;

  beforeEach(() => {
    authState$ = new BehaviorSubject(null);
    routerSpy = jasmine.createSpyObj('Router', ['navigate', 'createUrlTree']);
    routerSpy.createUrlTree.and.returnValue('/login' as any);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: SupabaseService, useValue: { authState$ } }
      ]
    });
  });

  it('should block unauthenticated users', async () => {
    authState$.next(null);
    const result = await TestBed.runInInjectionContext(() =>
      authGuard(null as any, { url: '/admin' } as RouterStateSnapshot)
    );
    expect(result).toBeTruthy(); // returns UrlTree (truthy)
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/admin' } });
  });

  it('should allow authenticated users', async () => {
    authState$.next({ user: { id: 'uid-1' } });
    const result = await TestBed.runInInjectionContext(() =>
      authGuard(null as any, { url: '/admin' } as RouterStateSnapshot)
    );
    expect(result).toBeTrue();
  });
});
