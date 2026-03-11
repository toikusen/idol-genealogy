import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AdminRoleService } from './admin-role.service';

describe('adminGuard', () => {
  let routerSpy: jasmine.SpyObj<Router>;

  function setup(isAdmin: boolean) {
    routerSpy = jasmine.createSpyObj('Router', ['createUrlTree']);
    routerSpy.createUrlTree.and.returnValue('/admin' as any);
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: AdminRoleService, useValue: { isAdmin: () => Promise.resolve(isAdmin) } }
      ]
    });
  }

  it('allows admin users', async () => {
    setup(true);
    const result = await TestBed.runInInjectionContext(() =>
      adminGuard(null as any, { url: '/admin/audit-log' } as RouterStateSnapshot)
    );
    expect(result).toBeTrue();
  });

  it('redirects non-admin users to /admin', async () => {
    setup(false);
    const result = await TestBed.runInInjectionContext(() =>
      adminGuard(null as any, { url: '/admin/audit-log' } as RouterStateSnapshot)
    );
    expect(result).not.toBeTrue(); // must return a UrlTree, not boolean true
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/admin']);
  });
});
