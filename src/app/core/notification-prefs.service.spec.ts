import { TestBed } from '@angular/core/testing';
import { NotificationPrefsService } from './notification-prefs.service';
import { SupabaseService } from './supabase.service';
import { DEFAULT_NOTIFICATION_PREFS } from '../models';

function makeDb(rowData: any = null, upsertError: any = null) {
  const maybeSingle = jasmine.createSpy('maybeSingle').and.returnValue(
    Promise.resolve({ data: rowData, error: null })
  );
  const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle });
  const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });

  const upsert = jasmine.createSpy('upsert').and.returnValue(
    Promise.resolve({ error: upsertError })
  );

  const fromSpy = jasmine.createSpy('from').and.callFake((_table: string) => ({
    select: selectSpy,
    upsert,
  }));

  return { from: fromSpy, upsert };
}

describe('NotificationPrefsService', () => {
  let service: NotificationPrefsService;
  let mockDb: ReturnType<typeof makeDb>;

  function setup(rowData: any = null) {
    mockDb = makeDb(rowData);
    TestBed.configureTestingModule({
      providers: [
        NotificationPrefsService,
        {
          provide: SupabaseService,
          useValue: { client: mockDb },
        },
      ],
    });
    service = TestBed.inject(NotificationPrefsService);
  }

  it('prefs() returns all-true defaults before loading', () => {
    setup();
    expect(service.prefs()).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('load() with no existing row keeps all-true defaults', async () => {
    setup(null); // no row
    await service.load('u-1');
    expect(service.prefs()).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('load() with existing row applies saved values', async () => {
    setup({
      notify_event: true,
      notify_new_song: false,
      notify_status: false,
      notify_birthday: true,
      notify_disbanded: true,
    });
    await service.load('u-1');
    expect(service.prefs().notify_new_song).toBeFalse();
    expect(service.prefs().notify_status).toBeFalse();
    expect(service.prefs().notify_event).toBeTrue();
  });

  it('load() is idempotent for the same userId', async () => {
    setup(null);
    await service.load('u-1');
    await service.load('u-1');
    expect(mockDb.from).toHaveBeenCalledTimes(1);
  });

  it('save() optimistically updates prefs signal', async () => {
    setup(null);
    await service.load('u-1');
    await service.save('notify_status', false);
    expect(service.prefs().notify_status).toBeFalse();
  });

  it('save() calls upsert with updated_at', async () => {
    setup(null);
    await service.load('u-1');
    await service.save('notify_birthday', false);
    expect(mockDb.upsert).toHaveBeenCalled();
    const upsertArg = mockDb.upsert.calls.mostRecent().args[0];
    expect(upsertArg.user_id).toBe('u-1');
    expect(upsertArg.notify_birthday).toBeFalse();
    expect(typeof upsertArg.updated_at).toBe('string');
  });

  it('load() re-fetches when called with a different userId', async () => {
    setup(null);
    await service.load('u-1');
    await service.load('u-2');
    expect(mockDb.from).toHaveBeenCalledTimes(2);
  });
});
