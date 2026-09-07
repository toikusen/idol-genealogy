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
  it('prompts on first visit when permission has not been asked', async () => {
    const { pushService, component } = setup('default', false);
    await component.ngOnInit();
    expect(pushService.subscribe).toHaveBeenCalled();
  });

  it('does not prompt again once permission is granted', async () => {
    // A granted-but-unsubscribed device is repaired by ensureSubscribed() at app start,
    // not by this page — prompting here would fire on every visit.
    const { pushService, component } = setup('granted', false);
    await component.ngOnInit();
    expect(pushService.subscribe).not.toHaveBeenCalled();
  });

  it('does not prompt when permission is denied', async () => {
    const { pushService, component } = setup('denied', false);
    await component.ngOnInit();
    expect(pushService.subscribe).not.toHaveBeenCalled();
  });
});
