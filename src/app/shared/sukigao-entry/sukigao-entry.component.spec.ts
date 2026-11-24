import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnalyticsService } from '../../core/analytics.service';
import { SukigaoEntryComponent } from './sukigao-entry.component';

describe('SukigaoEntryComponent', () => {
  it('links to /sukigao and reports the hosting page on click', () => {
    const analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['trackEvent']);
    TestBed.configureTestingModule({
      imports: [SukigaoEntryComponent],
      providers: [provideRouter([]), { provide: AnalyticsService, useValue: analytics }],
    });
    const fixture = TestBed.createComponent(SukigaoEntryComponent);
    fixture.componentRef.setInput('page', 'member');
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a');
    expect(link.getAttribute('href')).toBe('/sukigao');

    fixture.componentInstance.trackClick();
    expect(analytics.trackEvent).toHaveBeenCalledWith('sukigao_entry_click', { entry_page: 'member' });
  });
});
