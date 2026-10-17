import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSpaRoute, shouldNoIndexQueryUrl } from '../functions/_middleware.ts';

const check = (path: string) => shouldNoIndexQueryUrl(new URL(`https://idolmaps.com${path}`));

test('query-string page URLs get noindex', () => {
  assert.equal(check('/members?page=2'), true);
  assert.equal(check('/member/abc/?ref=x'), true);
  assert.equal(check('/index.html?x=1'), true);
});

test('URLs without a query never get noindex', () => {
  assert.equal(check('/members'), false);
  assert.equal(check('/favicon.svg'), false);
});

test('cache-busted static assets are not noindexed', () => {
  assert.equal(check('/favicon.ico?v=4'), false);
  assert.equal(check('/favicon.svg?v=4'), false);
  assert.equal(check('/icons/apple-touch-icon.png?v=4'), false);
  assert.equal(check('/manifest.webmanifest?v=4'), false);
});

test('existing exemptions still hold', () => {
  assert.equal(check('/api/sukigao-stats?id=1'), false);
  assert.equal(check('/sitemap.xml?x=1'), false);
});

test('client-rendered pages are served the SPA shell', () => {
  assert.equal(isSpaRoute('/upload-plan'), true);
  assert.equal(isSpaRoute('/login'), true);
  assert.equal(isSpaRoute('/members'), false);
});
