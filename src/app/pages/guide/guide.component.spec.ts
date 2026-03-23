// src/app/pages/guide/guide.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { GuideComponent } from './guide.component';
import { provideRouter } from '@angular/router';
import { SeoService } from '../../core/seo.service';

describe('GuideComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuideComponent],
      providers: [
        provideRouter([]),
        { provide: SeoService, useValue: { setPage: jasmine.createSpy() } },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(GuideComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should call seo.setPage on init', () => {
    const seo = TestBed.inject(SeoService);
    const fixture = TestBed.createComponent(GuideComponent);
    fixture.detectChanges();
    expect(seo.setPage).toHaveBeenCalledWith(
      '貢獻者手冊 | Idol Maps',
      jasmine.any(String),
      jasmine.any(String),
    );
  });
});
