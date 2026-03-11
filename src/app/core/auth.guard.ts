import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from './supabase.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  const session = await firstValueFrom(supabase.authState$);
  if (session) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
