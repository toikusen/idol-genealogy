import { Injectable, Inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

const SITE_URL = 'https://idolmaps.com';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

@Injectable({ providedIn: 'root' })
export class SeoService {
  constructor(
    private title: Title,
    private meta: Meta,
    @Inject(DOCUMENT) private doc: Document
  ) {}

  setPage(pageTitle: string, description: string, url: string, image?: string): void {
    const ogImage = image ?? DEFAULT_OG_IMAGE;
    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: ogImage });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: ogImage });
  }

  setJsonLd(data: object): void {
    this.clearJsonLd();
    const script = this.doc.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'ld-json';
    script.textContent = JSON.stringify(data);
    this.doc.head.appendChild(script);
  }

  clearJsonLd(): void {
    const existing = this.doc.head.querySelector('#ld-json');
    if (existing) this.doc.head.removeChild(existing);
  }
}
