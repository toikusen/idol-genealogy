// Renders scripts/og/sukigao-og.html → public/og-sukigao.png (1200×630).
// Needs Playwright + Chromium: PLAYWRIGHT_CHROMIUM=/path/to/chrome node scripts/og/render-og.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(resolve(here, 'sukigao-og.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve(here, '../../public/og-sukigao.png') });
await browser.close();
console.log('wrote public/og-sukigao.png');
