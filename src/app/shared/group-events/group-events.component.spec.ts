import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { GroupEventsComponent } from './group-events.component';
import { GoogleCalendarService } from '../../core/google-calendar.service';
import { TimeTreeService } from '../../core/timetree.service';
import { Group, Member, VenueCalendarEvent } from '../../models';

function mockGroup(id: string, name = `Group ${id}`): Group {
  return { id, name, name_jp: null, photo_url: null, color: '#000', company: null, company_id: null,
    founded_at: null, disbanded_at: null, notes: null, is_trainee: false, style: null,
    instagram: null, facebook: null, x: null, youtube: null, timetree_url: null,
    updated_at: '2026-01-01', created_at: '2026-01-01' };
}

function mockEvent(id: string, start = '2026-06-01T10:00:00'): VenueCalendarEvent {
  return { id, title: `Event ${id}`, start, end: null, location: null, url: `https://example.com/${id}`, isAllDay: false };
}

function mockMember(id: string, name = `Member ${id}`): Member {
  return {
    id, name, name_hiragana: null, name_roman: null, emoji: null, photo_url: null,
    color: null, color_name: null, birthdate: null, nickname: null, instagram: null,
    facebook: null, x: null, maid_url: null, notes: null, company_id: null,
    no_sns: false, updated_at: '2026-01-01', created_at: '2026-01-01',
  };
}

describe('GroupEventsComponent', () => {
  let component: GroupEventsComponent;
  let fixture: ComponentFixture<GroupEventsComponent>;
  let calendarSpy: jasmine.SpyObj<GoogleCalendarService>;
  let timetreeSpy: jasmine.SpyObj<TimeTreeService>;

  beforeEach(async () => {
    calendarSpy = jasmine.createSpyObj('GoogleCalendarService', ['getUpcomingGroupEvents', 'getUpcomingMemberEvents']);
    timetreeSpy = jasmine.createSpyObj('TimeTreeService', ['getUpcomingEvents']);
    await TestBed.configureTestingModule({
      imports: [GroupEventsComponent],
      providers: [
        { provide: GoogleCalendarService, useValue: calendarSpy },
        { provide: TimeTreeService, useValue: timetreeSpy },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GroupEventsComponent);
    component = fixture.componentInstance;
  });

  function triggerChange(newGroups: Group[]): void {
    component.groups = newGroups;
    component.ngOnChanges({ groups: new SimpleChange(null, newGroups, true) });
  }

  async function settleEvents(): Promise<void> {
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  it('hides section when no events returned', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('shows events in single mode', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([mockEvent('e1')]));
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    // source label <a> + 1 event link = 2 total
    expect(fixture.nativeElement.querySelectorAll('a').length).toBe(2);
  });

  it('deduplicates events across groups in merged mode', async () => {
    const shared = mockEvent('e1');
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([shared]));
    triggerChange([mockGroup('g1'), mockGroup('g2')]);
    await settleEvents();
    expect(component.mergedEvents.length).toBe(1);
    expect(component.mergedEvents[0].groupNames.length).toBe(2);
  });

  it('sorts merged events by start ascending', async () => {
    calendarSpy.getUpcomingGroupEvents.and.callFake((g: Group) =>
      g.id === 'g1'
        ? Promise.resolve([mockEvent('e2', '2026-06-10T10:00:00')])
        : Promise.resolve([mockEvent('e1', '2026-06-01T10:00:00')]),
    );
    triggerChange([mockGroup('g1'), mockGroup('g2')]);
    await settleEvents();
    expect(component.mergedEvents[0].id).toBe('e1');
    expect(component.mergedEvents[1].id).toBe('e2');
  });

  it('resets and reloads when groups input changes', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([mockEvent('e1')]));
    triggerChange([mockGroup('g1')]);
    await settleEvents();

    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    component.groups = [mockGroup('g2')];
    component.ngOnChanges({ groups: new SimpleChange([mockGroup('g1')], [mockGroup('g2')], false) });
    await settleEvents();
    expect(component.singleEvents.length).toBe(0);
  });

  it('hides section on load failure in single mode', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.reject('error'));
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('shows partial results when one group fails in merged mode', async () => {
    calendarSpy.getUpcomingGroupEvents.and.callFake((g: Group) =>
      g.id === 'g1' ? Promise.resolve([mockEvent('e1')]) : Promise.reject('err'),
    );
    triggerChange([mockGroup('g1'), mockGroup('g2')]);
    await settleEvents();
    expect(component.mergedEvents.length).toBe(1);
  });

  it('does not reload when a new groups array contains the same group ids', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([mockEvent('e1')]));
    triggerChange([mockGroup('g1')]);
    await settleEvents();

    component.groups = [mockGroup('g1')];
    component.ngOnChanges({ groups: new SimpleChange([mockGroup('g1')], [mockGroup('g1')], false) });
    await settleEvents();

    expect(calendarSpy.getUpcomingGroupEvents).toHaveBeenCalledTimes(1);
  });

  it('shows member individual events when member input is provided', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    calendarSpy.getUpcomingMemberEvents.and.returnValue(Promise.resolve([mockEvent('e-personal')]));
    component.member = mockMember('m1');
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(component.mergedEvents.length).toBe(1);
    expect(component.mergedEvents[0].id).toBe('e-personal');
  });

  it('deduplicates an event that appears in both group and member results', async () => {
    const ev = mockEvent('e-shared');
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([ev]));
    calendarSpy.getUpcomingMemberEvents.and.returnValue(Promise.resolve([ev]));
    component.member = mockMember('m1');
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(component.mergedEvents.length).toBe(1);
  });

  it('does not call getUpcomingMemberEvents when no member is provided', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(calendarSpy.getUpcomingMemberEvents).not.toHaveBeenCalled();
  });

  it('includes events from members array in single-group view', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    calendarSpy.getUpcomingMemberEvents.and.returnValue(Promise.resolve([mockEvent('e-member')]));
    component.members = [mockMember('m1')];
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(calendarSpy.getUpcomingMemberEvents).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'm1' }));
    expect(component.singleEvents.length).toBe(1);
    expect(component.singleEvents[0].id).toBe('e-member');
  });

  it('fetches events for each member in members array', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    calendarSpy.getUpcomingMemberEvents.and.returnValues(
      Promise.resolve([mockEvent('e-m1')]),
      Promise.resolve([mockEvent('e-m2')]),
    );
    component.members = [mockMember('m1'), mockMember('m2')];
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(calendarSpy.getUpcomingMemberEvents).toHaveBeenCalledTimes(2);
    expect(component.singleEvents.length).toBe(2);
  });

  it('deduplicates events that appear in both group and members results', async () => {
    const shared = mockEvent('e-shared');
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([shared]));
    calendarSpy.getUpcomingMemberEvents.and.returnValue(Promise.resolve([shared]));
    component.members = [mockMember('m1')];
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(component.singleEvents.length).toBe(1);
  });

  it('reloads when members input changes', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    calendarSpy.getUpcomingMemberEvents.and.returnValue(Promise.resolve([mockEvent('e1')]));
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(calendarSpy.getUpcomingGroupEvents).toHaveBeenCalledTimes(1);

    component.members = [mockMember('m1')];
    component.ngOnChanges({ members: new SimpleChange([], [mockMember('m1')], false) });
    await settleEvents();
    expect(calendarSpy.getUpcomingMemberEvents).toHaveBeenCalledTimes(1);
  });

  it('does not fetch member events when group uses TimeTree', async () => {
    const groupWithTimeTree = { ...mockGroup('g1'), timetree_url: 'https://timetreeapp.com/public_calendars/alias123/' };
    timetreeSpy.getUpcomingEvents.and.returnValue(Promise.resolve([mockEvent('tt1')]));
    component.members = [mockMember('m1')];
    triggerChange([groupWithTimeTree]);
    await settleEvents();
    expect(calendarSpy.getUpcomingMemberEvents).not.toHaveBeenCalled();
    expect(component.singleEvents.length).toBe(1);
    expect(component.singleEvents[0].id).toBe('tt1');
  });

  describe('TimeTree priority', () => {
    function mockGroupWithTimeTree(id: string): Group {
      return { ...mockGroup(id), timetree_url: 'https://timetreeapp.com/public_calendars/test_alias/' };
    }

    it('uses TimeTree when group has timetree_url', async () => {
      const ttEvent = mockEvent('tt1', '2026-07-01T00:00:00');
      timetreeSpy.getUpcomingEvents.and.returnValue(Promise.resolve([ttEvent]));
      calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
      triggerChange([mockGroupWithTimeTree('g1')]);
      await settleEvents();
      expect(timetreeSpy.getUpcomingEvents).toHaveBeenCalledWith('test_alias');
      expect(calendarSpy.getUpcomingGroupEvents).not.toHaveBeenCalled();
      expect(component.singleEvents.length).toBe(1);
      expect(component.singleEvents[0].id).toBe('tt1');
    });

    it('falls back to Google Calendar when TimeTree throws', async () => {
      const gcEvent = mockEvent('gc1', '2026-07-01T00:00:00');
      timetreeSpy.getUpcomingEvents.and.returnValue(Promise.reject(new Error('503')));
      calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([gcEvent]));
      triggerChange([mockGroupWithTimeTree('g1')]);
      await settleEvents();
      expect(calendarSpy.getUpcomingGroupEvents).toHaveBeenCalled();
      expect(component.singleEvents.length).toBe(1);
      expect(component.singleEvents[0].id).toBe('gc1');
    });

    it('uses Google Calendar directly when group has no timetree_url', async () => {
      const gcEvent = mockEvent('gc2');
      calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([gcEvent]));
      triggerChange([mockGroup('g1')]);
      await settleEvents();
      expect(timetreeSpy.getUpcomingEvents).not.toHaveBeenCalled();
      expect(component.singleEvents[0].id).toBe('gc2');
    });

    it('sets eventSource to timetree when TimeTree succeeds', async () => {
      timetreeSpy.getUpcomingEvents.and.returnValue(Promise.resolve([mockEvent('tt1')]));
      triggerChange([mockGroupWithTimeTree('g1')]);
      await settleEvents();
      expect(component.eventSource).toBe('timetree');
    });

    it('sets eventSource to google when TimeTree fails', async () => {
      timetreeSpy.getUpcomingEvents.and.returnValue(Promise.reject(new Error('503')));
      calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([mockEvent('gc1')]));
      triggerChange([mockGroupWithTimeTree('g1')]);
      await settleEvents();
      expect(component.eventSource).toBe('google');
    });

    it('supports TimeTree short links', async () => {
      const ttEvent = mockEvent('tt-short');
      timetreeSpy.getUpcomingEvents.and.returnValue(Promise.resolve([ttEvent]));
      triggerChange([{ ...mockGroup('g1'), timetree_url: 'https://timetr.ee/p/short_alias' }]);
      await settleEvents();
      expect(timetreeSpy.getUpcomingEvents).toHaveBeenCalledWith('short_alias');
      expect(calendarSpy.getUpcomingGroupEvents).not.toHaveBeenCalled();
      expect(component.singleEvents[0].id).toBe('tt-short');
    });

    it('falls back to Google Calendar when timetree_url is malformed', async () => {
      const gcEvent = mockEvent('gc-malformed');
      calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([gcEvent]));
      triggerChange([{ ...mockGroup('g1'), timetree_url: 'not a url' }]);
      await settleEvents();
      expect(timetreeSpy.getUpcomingEvents).not.toHaveBeenCalled();
      expect(calendarSpy.getUpcomingGroupEvents).toHaveBeenCalled();
      expect(component.singleEvents[0].id).toBe('gc-malformed');
    });
  });
});

describe('GroupEventsComponent.formatDate', () => {
  let component: GroupEventsComponent;
  let calendarSpy: jasmine.SpyObj<GoogleCalendarService>;

  beforeEach(async () => {
    calendarSpy = jasmine.createSpyObj('GoogleCalendarService', ['getUpcomingGroupEvents', 'getUpcomingMemberEvents']);
    await TestBed.configureTestingModule({
      imports: [GroupEventsComponent],
      providers: [{ provide: GoogleCalendarService, useValue: calendarSpy }],
    }).compileComponents();
    component = TestBed.createComponent(GroupEventsComponent).componentInstance;
  });

  it('returns M/D for single-day event', () => {
    expect((component as any).formatDate('2026-05-29', null, false)).toBe('5/29');
  });

  it('returns M/D–D for same-month multi-day all-day event', () => {
    // Google Calendar all-day end is exclusive: 6/1 means last day is 5/31
    expect((component as any).formatDate('2026-05-29', '2026-06-01', true)).toBe('5/29–31');
  });

  it('returns M/D–M/D for cross-month all-day event', () => {
    expect((component as any).formatDate('2026-05-30', '2026-06-02', true)).toBe('5/30–6/1');
  });

  it('returns M/D when end equals start (same day after exclusive adjustment)', () => {
    expect((component as any).formatDate('2026-05-29', '2026-05-30', true)).toBe('5/29');
  });

  it('returns M/D–D for timed multi-day event', () => {
    expect((component as any).formatDate('2026-05-29T18:00:00', '2026-05-31T22:00:00', false)).toBe('5/29–31');
  });
});
