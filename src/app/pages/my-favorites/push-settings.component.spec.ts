import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { PushSettingsComponent } from './push-settings.component';
import { PushNotificationService } from '../../core/push-notification.service';
import { NotificationPrefsService } from '../../core/notification-prefs.service';
import { SupabaseService } from '../../core/supabase.service';

function setup(permission: NotificationPermission, subscribed: boolean) {
  spyOnProperty(Notification, 'permission', 'get').and.returnValue(permission);

  const pushService = {
    isSupported: () => true,
    isSubscribed: signal(subscribed),
    checkSubscription: jasmine.createSpy('checkSubscription').and.resolveTo(undefined),
    subscribe: jasmine.createSpy('subscribe').and.resolveTo(undefined),
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: PushNotificationService, useValue: pushService },
      { provide: NotificationPrefsService, useValue: { prefs: signal({}), load: () => Promise.resolve() } },
      { provide: SupabaseService, useValue: { getSessionOnce: () => Promise.resolve({ user: { id: 'u-1' } }) } },
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });

  return { pushService, component: TestBed.createComponent(PushSettingsComponent).componentInstance };
}

describe('PushSettingsComponent', () => {
  // Opening this page must never raise the browser permission dialog on its own: a
  // dismissal pins permission at 'denied' and no app code can reopen it. The explicit
  // 「開啟通知」button is the prompt.
  for (const permission of ['default', 'granted', 'denied'] as NotificationPermission[]) {
    it(`does not auto-prompt when permission is ${permission}`, async () => {
      const { pushService, component } = setup(permission, false);
      await component.ngOnInit();
      expect(pushService.subscribe).not.toHaveBeenCalled();
    });
  }

  it('still reports the current subscription state', async () => {
    const { pushService, component } = setup('granted', true);
    await component.ngOnInit();
    expect(pushService.checkSubscription).toHaveBeenCalled();
  });
});
