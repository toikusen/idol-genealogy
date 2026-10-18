import { recoverStaticPage } from './not-found.component';

const fakeWindow = (pathname: string, stored: string | null = null) => {
  const store = new Map<string, string>(stored ? [['swRecover', stored]] : []);
  const unregister = jasmine.createSpy('unregister').and.resolveTo(true);
  const reload = jasmine.createSpy('reload');
  const w = {
    location: { pathname, reload },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    navigator: { serviceWorker: { getRegistrations: () => Promise.resolve([{ unregister }]) } },
  };
  return { w: w as unknown as Window, unregister, reload };
};

describe('recoverStaticPage', () => {
  it('drops the stale service worker and reloads once on /view', async () => {
    const { w, unregister, reload } = fakeWindow('/view');
    expect(recoverStaticPage(w)).toBeTrue();
    await new Promise(r => setTimeout(r));
    expect(unregister).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('does not loop: a second landing in the same tab shows the 404', () => {
    const { w, reload } = fakeWindow('/view', '1');
    expect(recoverStaticPage(w)).toBeFalse();
    expect(reload).not.toHaveBeenCalled();
  });

  it('leaves real 404s alone', () => {
    const { w } = fakeWindow('/viewer-not-here');
    expect(recoverStaticPage(w)).toBeFalse();
    expect(recoverStaticPage(fakeWindow('/members/xyz').w)).toBeFalse();
  });
});
