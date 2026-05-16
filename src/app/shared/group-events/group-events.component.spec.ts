import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { GroupEventsComponent } from './group-events.component';
import { GoogleCalendarService } from '../../core/google-calendar.service';
import { Group, VenueCalendarEvent } from '../../models';

function mockGroup(id: string, name = `Group ${id}`): Group {
  return { id, name, name_jp: null, photo_url: null, color: '#000', company: null, company_id: null,
    founded_at: null, disbanded_at: null, notes: null, is_trainee: false, style: null,
    instagram: null, facebook: null, x: null, youtube: null,
    updated_at: '2026-01-01', created_at: '2026-01-01' };
}

function mockEvent(id: string, start = '2026-06-01T10:00:00'): VenueCalendarEvent {
  return { id, title: `Event ${id}`, start, end: null, location: null, url: `https://example.com/${id}`, isAllDay: false };
}

describe('GroupEventsComponent', () => {
  let component: GroupEventsComponent;
  let fixture: ComponentFixture<GroupEventsComponent>;
  let calendarSpy: jasmine.SpyObj<GoogleCalendarService>;

  beforeEach(async () => {
    calendarSpy = jasmine.createSpyObj('GoogleCalendarService', ['getUpcomingGroupEvents']);
    await TestBed.configureTestingModule({
      imports: [GroupEventsComponent],
      providers: [{ provide: GoogleCalendarService, useValue: calendarSpy }],
    }).compileComponents();
    fixture = TestBed.createComponent(GroupEventsComponent);
    component = fixture.componentInstance;
  });

  function triggerChange(newGroups: Group[]): void {
    component.groups = newGroups;
    component.ngOnChanges({ groups: new SimpleChange(null, newGroups, true) });
  }

  it('hides section when no events returned', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    triggerChange([mockGroup('g1')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('shows events in single mode', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([mockEvent('e1')]));
    triggerChange([mockGroup('g1')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a').length).toBe(1);
  });

  it('deduplicates events across groups in merged mode', async () => {
    const shared = mockEvent('e1');
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([shared]));
    triggerChange([mockGroup('g1'), mockGroup('g2')]);
    await fixture.whenStable();
    fixture.detectChanges();
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
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.mergedEvents[0].id).toBe('e1');
    expect(component.mergedEvents[1].id).toBe('e2');
  });

  it('resets and reloads when groups input changes', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([mockEvent('e1')]));
    triggerChange([mockGroup('g1')]);
    await fixture.whenStable();

    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    component.groups = [mockGroup('g2')];
    component.ngOnChanges({ groups: new SimpleChange([mockGroup('g1')], [mockGroup('g2')], false) });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.singleEvents.length).toBe(0);
  });

  it('hides section on load failure in single mode', async () => {
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.reject('error'));
    triggerChange([mockGroup('g1')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('shows partial results when one group fails in merged mode', async () => {
    calendarSpy.getUpcomingGroupEvents.and.callFake((g: Group) =>
      g.id === 'g1' ? Promise.resolve([mockEvent('e1')]) : Promise.reject('err'),
    );
    triggerChange([mockGroup('g1'), mockGroup('g2')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.mergedEvents.length).toBe(1);
  });
});
