import { TestBed } from '@angular/core/testing';
import { PushNotificationService } from './push-notification.service';
import { SwPush } from '@angular/service-worker';
import { SupabaseService } from './supabase.service';
import { PLATFORM_ID } from '@angular/core';

const mockSwPush = {
  isEnabled: false,
  requestSubscription: jasmine.createSpy('requestSubscription').and.returnValue(
    Promise.resolve({
      endpoint: 'https://push.example.com/sub',
      toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
    })
  ),
  subscription: { toPromise: () => Promise.resolve(null) },
};

const mockDb = {
  from: jasmine.createSpy('from').and.returnValue({
    upsert: jasmine.createSpy('upsert').and.returnValue(Promise.resolve({ error: null })),
    delete: jasmine.createSpy('delete').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue({
        eq: jasmine.createSpy('eq2').and.returnValue(Promise.resolve({ error: null })),
      }),
    }),
  }),
};

describe('PushNotificationService', () => {
  let service: PushNotificationService;

  beforeEach(() => {
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
});
