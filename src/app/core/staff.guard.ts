import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminRoleService } from './admin-role.service';

export const staffGuard: CanActivateFn = async (_route, _state) => {
  const adminRoleService = inject(AdminRoleService);
  const router = inject(Router);
  const isStaff = await adminRoleService.isStaff();
  if (isStaff) return true;
  return router.createUrlTree(['/']);
};
