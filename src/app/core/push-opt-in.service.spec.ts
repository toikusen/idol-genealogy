import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { PushOptInService } from './push-opt-in.service';
import { PushNotificationService } from './push-notification.service';

const SNOOZE_KEY = 'push_optin_snooze_until';
const ASK_COUNT_KEY = 'push_optin_asks';

function setup(overrides: Partial<{
  permission: NotificationPermission | 'default';
  subscribed: boolean;
  supported: boolean;
  subscribe: jasmine.Spy;
}> = {}) {
  const push = {
    permission: overrides.permission ?? 'default',
    isSubscribed: signal(overrides.subscribed ?? false),
    isSupported: () => overrides.supported ?? true,
    subscribe: overrides.subscribe ?? jasmine.createSpy('subscribe').and.resolveTo(undefined),
  };

  TestBed.configureTestingModule({
    providers: [
      PushOptInService,
      { provide: PushNotificationService, useValue: push },
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });

  return { push, service: TestBed.inject(PushOptInService) };
}

describe('PushOptInService', () => {
  beforeEach(() => {
    localStorage.removeItem(SNOOZE_KEY);
    localStorage.removeItem(ASK_COUNT_KEY);
  });

  afterAll(() => {
    localStorage.removeItem(SNOOZE_KEY);
    localStorage.removeItem(ASK_COUNT_KEY);
  });

  it('offers when permission has not been asked yet', () => {
    const { service } = setup();
    service.offer('group');
    expect(service.subject()).toBe('這個團體');
  });

  it('never offers once permission is denied', () => {
    // 'denied' cannot be undone from JS, so asking again can only annoy.
    const { service } = setup({ permission: 'denied' });
    service.offer('group');
    expect(service.subject()).toBeNull();
  });

  it('never offers when already subscribed', () => {
    const { service } = setup({ permission: 'granted', subscribed: true });
    service.offer('member');
    expect(service.subject()).toBeNull();
  });

  it('counts one ask when several favourites are added in a row', () => {
    // The prompt is already open on the second and third call — the user saw one prompt.
    const { service } = setup();
    service.offer('group');
    service.offer('member');
    service.offer('group');
    expect(localStorage.getItem(ASK_COUNT_KEY)).toBe('1');
    expect(service.shouldOffer()).toBeTrue();
  });

  it('ignores offers raised while a subscribe is in flight', () => {
    const { service } = setup();
    service.busy.set(true);
    service.offer('group');
    expect(service.subject()).toBeNull();
  });

  it('stops offering after three asks', () => {
    const { service } = setup();
    for (let i = 0; i < 3; i++) {
      service.offer('group');
      service.subject.set(null);
    }
    service.offer('group');
    expect(service.subject()).toBeNull();
  });

  it('dismiss snoozes instead of blocking permission for good', () => {
    const { service, push } = setup();
    service.offer('group');
    service.dismiss();

    expect(service.subject()).toBeNull();
    expect(Number(localStorage.getItem(SNOOZE_KEY))).toBeGreaterThan(Date.now());
    expect(push.subscribe).not.toHaveBeenCalled();
    expect(service.shouldOffer()).toBeFalse();
  });

  it('accept raises the real permission dialog and closes the prompt', async () => {
    const subscribe = jasmine.createSpy('subscribe').and.resolveTo(undefined);
    const { service } = setup({ subscribe });
    service.offer('group');

    await service.accept();

    expect(subscribe).toHaveBeenCalled();
    expect(service.subject()).toBeNull();
    expect(service.error()).toBe('');
  });

  it('keeps the prompt open and surfaces the reason when subscribing fails', async () => {
    const subscribe = jasmine.createSpy('subscribe').and.rejectWith(new Error('訂閱逾時，請稍後再試'));
    const { service } = setup({ subscribe });
    service.offer('group');

    await service.accept();

    expect(service.subject()).toBe('這個團體');
    expect(service.error()).toBe('訂閱逾時，請稍後再試');
    expect(service.busy()).toBeFalse();
  });

  it('needsInstall is true where the platform cannot subscribe yet', () => {
    expect(setup({ supported: false }).service.needsInstall()).toBeTrue();
  });

  it('needsInstall is false once the platform supports push', () => {
    expect(setup({ supported: true }).service.needsInstall()).toBeFalse();
  });
});
