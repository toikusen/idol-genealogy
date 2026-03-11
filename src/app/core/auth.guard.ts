import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  // Wait for the session to be resolved from getSession() before checking.
  // authState$ starts as null; sessionReady$ emits once getSession() resolves
  // (either a real session or explicit null from onAuthStateChange).
  const session = await supabase.getSessionOnce();
  if (session) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
