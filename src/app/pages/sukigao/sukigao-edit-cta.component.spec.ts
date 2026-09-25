import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SukigaoEditCtaComponent } from './sukigao-edit-cta.component';
import { AnalyticsService } from '../../core/analytics.service';
import { SukigaoCandidate } from '../../models';

const face = (id: string, name: string): SukigaoCandidate => ({
  id, name, photoUrl: '', groupNames: [], color: null, isCurrent: true,
});

describe('SukigaoEditCtaComponent', () => {
  let fixture: ComponentFixture<SukigaoEditCtaComponent>;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(async () => {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['trackEvent']);
    await TestBed.configureTestingModule({
      imports: [SukigaoEditCtaComponent],
      providers: [provideRouter([]), { provide: AnalyticsService, useValue: analytics }],
    }).compileComponents();
    fixture = TestBed.createComponent(SukigaoEditCtaComponent);
  });

  it('compact: links every face on screen to its edit panel in a new tab', () => {
    fixture.componentRef.setInput('variant', 'compact');
    fixture.componentRef.setInput('context', 'preliminary');
    fixture.componentRef.setInput('faces', [face('a1', '甲'), face('b2', '乙')]);
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('a.skedit__fix') as NodeListOf<HTMLAnchorElement>;
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('/member/a1?propose=true');
    expect(links[0].target).toBe('_blank');
    expect(links[0].rel).toContain('noopener');
  });

  it('compact: renders nothing without faces', () => {
    fixture.componentRef.setInput('variant', 'compact');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.skedit')).toBeNull();
  });

  it('full: points to /wanted and the rest of the site', () => {
    fixture.componentRef.setInput('variant', 'full');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('不用登入也能提案修正');
    expect(text).toContain('關於 Idol Maps');
    const hrefs = Array.from(fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>)
      .map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/wanted');
    expect(hrefs).toContain('/');
  });

  it('tracks clicks by context only, never by member', () => {
    fixture.componentRef.setInput('variant', 'compact');
    fixture.componentRef.setInput('context', 'final');
    fixture.componentRef.setInput('faces', [face('secret-id', '甲')]);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('a.skedit__fix') as HTMLAnchorElement;
    link.addEventListener('click', e => e.preventDefault());
    link.click();
    expect(analytics.trackEvent).toHaveBeenCalledOnceWith('sukigao_edit_click', { context: 'final' });
  });
});
