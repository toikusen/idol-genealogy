import { TestBed } from '@angular/core/testing';
import { PushNotificationService } from './push-notification.service';
import { SwPush } from '@angular/service-worker';
import { SupabaseService } from './supabase.service';
import { PLATFORM_ID } from '@angular/core';
import { of } from 'rxjs';

const mockSwPush = {
  isEnabled: false,
  requestSubscription: jasmine.createSpy('requestSubscription').and.returnValue(
    Promise.resolve({
      endpoint: 'https://push.example.com/sub',
      toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
    })
  ),
  subscription: of(null) as any,
};

const mockDb = {
  from: jasmine.createSpy('from').and.returnValue({
    upsert: jasmine.createSpy('upsert').and.returnValue(Promise.resolve({ error: null })),
    select: jasmine.createSpy('select').and.returnValue({
      eq: jasmine.createSpy('selectEq').and.returnValue(Promise.resolve({ count: 1, error: null })),
    }),
    delete: jasmine.createSpy('delete').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue({
        eq: jasmine.createSpy('eq2').and.returnValue(Promise.resolve({ error: null })),
      }),
    }),
  }),
};

function browserSubscription(endpoint: string) {
  return of({
    endpoint,
    toJSON: () => ({ keys: { p256dh: 'live-key', auth: 'live-auth' } }),
  }) as any;
}

describe('PushNotificationService', () => {
  let service: PushNotificationService;

  beforeEach(() => {
    // mockSwPush is module-level shared state and jasmine randomizes test order.
    mockSwPush.isEnabled = false;
    mockSwPush.subscription = of(null) as any;
    mockSwPush.requestSubscription.calls.reset();
    mockDb.from().upsert.calls.reset();
    mockDb.from().upsert.and.returnValue(Promise.resolve({ error: null }));

    TestBed.configureTestingModule({
      providers: [
        PushNotificationService,
        { provide: SwPush, useValue: mockSwPush },
        {
          provide: SupabaseService,
          useValue: {
            client: mockDb,
            getSessionOnce: () => Promise.resolve({ user: { id: 'u-1' } }),
          },
        },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    service = TestBed.inject(PushNotificationService);
  });

  it('should create', () => expect(service).toBeTruthy());

  it('isSupported returns false when swPush.isEnabled is false', () => {
    expect(service.isSupported()).toBeFalse();
  });

  describe('ensureSubscribed', () => {
    it('re-upserts the endpoint the browser still holds', async () => {
      // The push service expired the endpoint and send-push-notification reaped the row,
      // but the browser kept its subscription object — write it back.
      mockSwPush.isEnabled = true;
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('granted');
      mockSwPush.subscription = browserSubscription('https://web.push.apple.com/kept');

      await service.ensureSubscribed();

      expect(mockSwPush.requestSubscription).not.toHaveBeenCalled();
      expect(mockDb.from().upsert).toHaveBeenCalledWith(
        {
          user_id: 'u-1',
          endpoint: 'https://web.push.apple.com/kept',
          p256dh: 'live-key',
          auth_key: 'live-auth',
        },
        { onConflict: 'user_id,endpoint' },
      );
      expect(service.isSubscribed()).toBeTrue();
    });

    it('re-subscribes silently when the browser dropped the subscription too', async () => {
      mockSwPush.isEnabled = true;
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('granted');
      mockSwPush.subscription = of(null) as any;

      await service.ensureSubscribed();

      expect(mockSwPush.requestSubscription).toHaveBeenCalled();
      expect(mockDb.from().upsert).toHaveBeenCalled();
      expect(service.isSubscribed()).toBeTrue();
    });

    it('never prompts when permission has not been granted', async () => {
      mockSwPush.isEnabled = true;
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('default');

      await service.ensureSubscribed();

      expect(mockSwPush.requestSubscription).not.toHaveBeenCalled();
      expect(mockDb.from().upsert).not.toHaveBeenCalled();
    });

    it('swallows write failures so app startup is never blocked', async () => {
      mockSwPush.isEnabled = true;
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('granted');
      mockSwPush.subscription = browserSubscription('https://web.push.apple.com/kept');
      mockDb.from().upsert.and.returnValue(Promise.resolve({ error: { message: 'boom' } }));

      await expectAsync(service.ensureSubscribed()).toBeResolved();
    });
  });

  describe('lostOnThisDevice', () => {
    const storedRows = (count: number | null, error: unknown = null) =>
      mockDb.from().select().eq.and.returnValue(Promise.resolve({ count, error }));
    const installed = (standalone: boolean) =>
      spyOn(window, 'matchMedia').and.returnValue({ matches: standalone } as MediaQueryList);

    beforeEach(() => {
      mockSwPush.isEnabled = true;
      storedRows(1);
    });

    it('flags a reinstalled app: installed, never asked, but the account has a subscription', async () => {
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('default');
      installed(true);
      expect(await service.lostOnThisDevice()).toBeTrue();
    });

    it('stays quiet for an account that never subscribed anywhere', async () => {
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('default');
      installed(true);
      storedRows(0);
      expect(await service.lostOnThisDevice()).toBeFalse();
    });

    it('stays quiet in a plain browser tab', async () => {
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('default');
      installed(false);
      expect(await service.lostOnThisDevice()).toBeFalse();
    });

    it('stays quiet once permission was granted or denied', async () => {
      const permission = spyOnProperty(Notification, 'permission', 'get');
      installed(true);
      for (const p of ['granted', 'denied'] as NotificationPermission[]) {
        permission.and.returnValue(p);
        expect(await service.lostOnThisDevice()).withContext(p).toBeFalse();
      }
    });

    it('treats a failed lookup as nothing lost', async () => {
      spyOnProperty(Notification, 'permission', 'get').and.returnValue('default');
      installed(true);
      storedRows(null, { message: 'boom' });
      expect(await service.lostOnThisDevice()).toBeFalse();
    });
  });
});
