import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { ScheduleComponent } from '../../shared/schedule/schedule.component';
import { EventsComponent } from './events.component';

@Component({ selector: 'app-schedule', standalone: true, template: '' })
class ScheduleStubComponent {}

describe('EventsComponent', () => {
  it('sets its own title and canonical and hosts the schedule', () => {
    const seo = jasmine.createSpyObj<SeoService>('SeoService', ['setPage']);
    TestBed.configureTestingModule({
      imports: [EventsComponent],
      providers: [provideRouter([]), { provide: SeoService, useValue: seo }],
    }).overrideComponent(EventsComponent, {
      remove: { imports: [ScheduleComponent] },
      add: { imports: [ScheduleStubComponent] },
    });
    const fixture = TestBed.createComponent(EventsComponent);
    fixture.detectChanges();

    const [title, , url] = seo.setPage.calls.mostRecent().args;
    expect(title).toContain('活動行程');
    expect(url).toMatch(/\/events$/);
    expect(fixture.nativeElement.querySelector('app-schedule')).toBeTruthy();
  });
});
