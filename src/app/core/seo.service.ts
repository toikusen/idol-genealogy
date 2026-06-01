import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { siteUrl, SITE_URL } from './public-url.utils';

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly isBrowser: boolean;

  constructor(
    private title: Title,
    private meta: Meta,
    @Inject(DOCUMENT) private doc: Document,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  setPage(pageTitle: string, description: string, url: string, image?: string): void {
    const canonicalUrl = this.toAbsoluteUrl(url);
    const ogImage = image ? this.toAbsoluteUrl(image) : DEFAULT_OG_IMAGE;
    // Reset page-scoped SEO state so simple content pages do not inherit stale
    // robots directives or JSON-LD from a previously visited detail page.
    this.clearJsonLd();
    this.setRobotsNoIndex(false);
    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl });
    this.meta.updateTag({ property: 'og:image', content: ogImage });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: ogImage });
    // canonical
    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      if (typeof link.setAttribute === 'function') {
        link.setAttribute('rel', 'canonical');
      } else {
        (link as HTMLLinkElement & { rel?: string }).rel = 'canonical';
      }
      this.doc.head.appendChild(link);
    }
    if (typeof link.setAttribute === 'function') {
      link.setAttribute('href', canonicalUrl);
    } else {
      (link as HTMLLinkElement & { href?: string }).href = canonicalUrl;
    }
  }

  setJsonLd(data: object): void {
    this.clearJsonLd();
    const script = this.doc.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'ld-json';
    script.textContent = JSON.stringify(data);
    this.doc.head.appendChild(script);
  }

  /** Inject multiple JSON-LD schemas as a @graph block */
  setJsonLdGraph(schemas: object[]): void {
    this.clearJsonLd();
    const script = this.doc.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'ld-json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': schemas,
    });
    this.doc.head.appendChild(script);
  }

  clearJsonLd(): void {
    const existing = this.doc.head.querySelector('#ld-json');
    if (existing) this.doc.head.removeChild(existing);
  }

  setRobotsNoIndex(noIndex: boolean): void {
    // Robots meta must only be written during SSR/prerender — not by
    // client-side hydration. If the browser re-evaluated this with fresh
    // Supabase data, Googlebot's JS renderer would see a noindex that
    // contradicts the prerendered HTML it received first.
    if (this.isBrowser) return;
    const robots = noIndex ? 'noindex, follow' : 'index, follow';
    let tag = this.doc.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (tag) {
      if (typeof tag.setAttribute === 'function') {
        tag.setAttribute('content', robots);
      } else {
        (tag as HTMLMetaElement & { content?: string }).content = robots;
      }
    } else {
      tag = this.doc.createElement('meta');
      if (typeof tag.setAttribute === 'function') {
        tag.setAttribute('name', 'robots');
        tag.setAttribute('content', robots);
      } else {
        (tag as HTMLMetaElement & { name?: string; content?: string }).name = 'robots';
        (tag as HTMLMetaElement & { name?: string; content?: string }).content = robots;
      }
      this.doc.head.appendChild(tag);
    }
  }

  private toAbsoluteUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return siteUrl('/');
    if (/^[a-z][a-z0-9+\-.]*:/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    return siteUrl(trimmed);
  }
}
