import { TestBed } from '@angular/core/testing';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { SeoService } from './seo.service';

describe('SeoService', () => {
  let service: SeoService;
  let titleSpy: jasmine.SpyObj<Title>;
  let metaSpy: jasmine.SpyObj<Meta>;
  let mockHead: any;
  let mockDoc: any;

  beforeEach(() => {
    titleSpy = jasmine.createSpyObj('Title', ['setTitle']);
    metaSpy = jasmine.createSpyObj('Meta', ['updateTag']);
    mockHead = {
      querySelector: jasmine.createSpy('querySelector').and.returnValue(null),
      appendChild: jasmine.createSpy('appendChild'),
      removeChild: jasmine.createSpy('removeChild'),
    };
    mockDoc = {
      head: mockHead,
      createElement: jasmine.createSpy('createElement').and.callFake(() => ({
        type: '', id: '', textContent: ''
      })),
    };

    TestBed.configureTestingModule({
      providers: [
        SeoService,
        { provide: Title, useValue: titleSpy },
        { provide: Meta, useValue: metaSpy },
        { provide: DOCUMENT, useValue: mockDoc },
      ],
    });
    service = TestBed.inject(SeoService);
  });

  it('setPage() sets the document title', () => {
    service.setPage('Test Title', 'Test desc', 'https://example.com/');
    expect(titleSpy.setTitle).toHaveBeenCalledWith('Test Title');
  });

  it('setPage() updates description meta', () => {
    service.setPage('T', 'Test desc', 'https://example.com/');
    expect(metaSpy.updateTag).toHaveBeenCalledWith({ name: 'description', content: 'Test desc' });
  });

  it('setPage() updates og:title', () => {
    service.setPage('Test Title', 'D', 'https://example.com/');
    expect(metaSpy.updateTag).toHaveBeenCalledWith({ property: 'og:title', content: 'Test Title' });
  });

  it('setPage() updates og:description', () => {
    service.setPage('T', 'Test desc', 'https://example.com/');
    expect(metaSpy.updateTag).toHaveBeenCalledWith({ property: 'og:description', content: 'Test desc' });
  });

  it('setPage() updates og:url', () => {
    service.setPage('T', 'D', 'https://example.com/page');
    expect(metaSpy.updateTag).toHaveBeenCalledWith({ property: 'og:url', content: 'https://example.com/page' });
  });

  it('setPage() uses default og:image when image not provided', () => {
    service.setPage('T', 'D', 'https://example.com/');
    expect(metaSpy.updateTag).toHaveBeenCalledWith({
      property: 'og:image',
      content: 'https://idol-genealogy.pages.dev/og-default.png'
    });
  });

  it('setPage() uses provided og:image', () => {
    service.setPage('T', 'D', 'https://example.com/', 'https://example.com/img.png');
    expect(metaSpy.updateTag).toHaveBeenCalledWith({
      property: 'og:image',
      content: 'https://example.com/img.png'
    });
  });

  it('setJsonLd() creates a new ld+json script tag when none exists', () => {
    const mockScript = { type: '', id: '', textContent: '' };
    mockDoc.createElement.and.returnValue(mockScript);
    mockHead.querySelector.and.returnValue(null);

    service.setJsonLd({ '@type': 'WebSite', name: 'test' });

    expect(mockDoc.createElement).toHaveBeenCalledWith('script');
    expect(mockScript.type).toBe('application/ld+json');
    expect(mockScript.id).toBe('ld-json');
    expect(mockScript.textContent).toBe(JSON.stringify({ '@type': 'WebSite', name: 'test' }));
    expect(mockHead.appendChild).toHaveBeenCalledWith(mockScript);
  });

  it('setJsonLd() replaces an existing ld+json script tag', () => {
    const existingScript = { type: 'application/ld+json', id: 'ld-json', textContent: '' };
    const newScript = { type: '', id: '', textContent: '' };
    mockHead.querySelector.and.returnValue(existingScript);
    mockDoc.createElement.and.returnValue(newScript);

    service.setJsonLd({ '@type': 'Person' });

    expect(mockHead.removeChild).toHaveBeenCalledWith(existingScript);
    expect(mockHead.appendChild).toHaveBeenCalledWith(newScript);
  });

  it('clearJsonLd() removes the ld+json script tag when it exists', () => {
    const existingScript = { id: 'ld-json' };
    mockHead.querySelector.and.returnValue(existingScript);

    service.clearJsonLd();

    expect(mockHead.removeChild).toHaveBeenCalledWith(existingScript);
  });

  it('clearJsonLd() does nothing when no ld+json tag exists', () => {
    mockHead.querySelector.and.returnValue(null);
    expect(() => service.clearJsonLd()).not.toThrow();
    expect(mockHead.removeChild).not.toHaveBeenCalled();
  });
});
