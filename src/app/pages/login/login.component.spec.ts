import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { LoginComponent } from './login.component';
import { SupabaseService } from '../../core/supabase.service';

const RETURN_URL_KEY = 'login_return_url';

function setup(queryParams: Record<string, string>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideRouter([]),
      {
        provide: SupabaseService,
        useValue: { authState$: of({ user: { id: 'u-1' } }), signInWithGoogle: () => Promise.resolve() },
      },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
    ],
  });
  const navigateByUrl = spyOn(TestBed.inject(Router), 'navigateByUrl');
  return { navigateByUrl, create: () => TestBed.createComponent(LoginComponent) };
}

describe('LoginComponent return URL', () => {
  afterEach(() => sessionStorage.removeItem(RETURN_URL_KEY));

  it('returns an already-signed-in visitor to the page that sent them here', () => {
    const { navigateByUrl, create } = setup({ returnUrl: '/member/m-1' });
    create();
    expect(navigateByUrl).toHaveBeenCalledWith('/member/m-1');
  });

  it('returns to the URL parked before the OAuth round-trip, which arrives without query params', () => {
    sessionStorage.setItem(RETURN_URL_KEY, '/group/g-1');
    const { navigateByUrl, create } = setup({});
    create();
    expect(navigateByUrl).toHaveBeenCalledWith('/group/g-1');
    expect(sessionStorage.getItem(RETURN_URL_KEY)).toBeNull();
  });

  it('refuses a protocol-relative URL — that would leave the site', () => {
    const { navigateByUrl, create } = setup({ returnUrl: '//evil.example/phish' });
    create();
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('refuses an absolute URL to another host', () => {
    const { navigateByUrl, create } = setup({ returnUrl: 'https://evil.example/phish' });
    create();
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('falls back to the home page when no return URL was requested', () => {
    const { navigateByUrl, create } = setup({});
    create();
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('parks the return URL only once the sign-in flow actually starts', fakeAsync(() => {
    const { create } = setup({ returnUrl: '/member/m-2' });
    const comp = create().componentInstance;
    // The signed-in stub already consumed the redirect; what matters is that nothing was
    // parked just by opening the page.
    expect(sessionStorage.getItem(RETURN_URL_KEY)).toBeNull();

    void comp.signIn();
    tick();

    expect(sessionStorage.getItem(RETURN_URL_KEY)).toBe('/member/m-2');
  }));
});
