import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminRoleService } from './admin-role.service';

export const adminGuard: CanActivateFn = async (_route, _state) => {
  const adminRoleService = inject(AdminRoleService);
  const router = inject(Router);
  // isAdmin() already returns true for superadmin
  const isAdmin = await adminRoleService.isAdmin();
  if (isAdmin) return true;
  return router.createUrlTree(['/admin']);
};
