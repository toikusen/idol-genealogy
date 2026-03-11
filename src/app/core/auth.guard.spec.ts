import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { SupabaseService } from './supabase.service';

describe('authGuard', () => {
  let routerSpy: jasmine.SpyObj<Router>;

  function setup(session: any) {
    routerSpy = jasmine.createSpyObj('Router', ['navigate', 'createUrlTree']);
    routerSpy.createUrlTree.and.returnValue('/login' as any);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: SupabaseService, useValue: { getSessionOnce: () => Promise.resolve(session) } }
      ]
    });
  }

  it('should block unauthenticated users', async () => {
    setup(null);
    const result = await TestBed.runInInjectionContext(() =>
      authGuard(null as any, { url: '/admin' } as RouterStateSnapshot)
    );
    expect(result).toBeTruthy(); // returns UrlTree (truthy)
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/admin' } });
  });

  it('should allow authenticated users', async () => {
    setup({ user: { id: 'uid-1' } });
    const result = await TestBed.runInInjectionContext(() =>
      authGuard(null as any, { url: '/admin' } as RouterStateSnapshot)
    );
    expect(result).toBeTrue();
  });
});
