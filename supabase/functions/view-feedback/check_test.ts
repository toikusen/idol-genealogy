import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkFeedback, normalizeMessage } from './check.ts';

const base = { venue: 'jack', category: 'venue', message: '後面中間現在固定是 PA 台', elapsed_ms: 9000 };

Deno.test('accepts a normal report', () => {
  const r = checkFeedback(base);
  assertEquals('ok' in r && r.ok.venue, 'jack');
});

Deno.test('bots tripping the traps are dropped quietly', () => {
  assertEquals(checkFeedback({ ...base, website: 'http://spam' }), { spam: true });
  assertEquals(checkFeedback({ ...base, elapsed_ms: 500 }), { spam: true });
  assertEquals(checkFeedback({ ...base, elapsed_ms: undefined }), { spam: true });
});

Deno.test('rejects junk content', () => {
  for (const message of ['', '短', 'aaaaaaaaaa', 'x'.repeat(501), 'see http://a http://b http://c']) {
    assertEquals('error' in checkFeedback({ ...base, message }), true, message);
  }
  assertEquals('error' in checkFeedback({ ...base, category: 'ads' }), true);
  assertEquals('error' in checkFeedback({ ...base, venue: '<script>' }), true);
});

Deno.test('repeats match despite spacing and punctuation', () => {
  assertEquals(normalizeMessage('後面 中間是PA台！'), normalizeMessage('後面中間是 pa 台'));
});
