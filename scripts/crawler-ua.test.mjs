// Guards the User-Agent regex in supabase/migrations/098_increment_view_filter_crawler_ua.sql.
// Run with: node --test scripts/crawler-ua.test.mjs
//
// The pattern lives in plpgsql, which this repo has no way to execute in CI, so
// the check is here instead: JS `RegExp(..., 'i')` and Postgres `~*` agree on
// this pattern (plain alternation, no PCRE-only syntax). If you edit the regex
// in the migration, edit it here too — nothing enforces that but this comment.
//
// ponytail: one assert list, no fixtures. It exists to catch the two ways this
// regex can fail — letting Bingbot through, or dropping a real reader.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const CRAWLER_UA = /(bot|crawl|spider|slurp|headless|facebookexternalhit)/i;

// Every crawler observed in view_session_log as of 2026-08-11, plus the link
// previewers that would otherwise be counted as visitors.
const CRAWLERS = [
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Safari/537.36',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
  'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
  'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
  'Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)',
  'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/126.0.0.0 Safari/537.36',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Twitterbot/1.0',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)',
];

// Real reader traffic. Skewed to what this site actually gets: TW mobile and
// desktop, plus the in-app browsers idol fans arrive from.
const HUMANS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.61',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  // In-app browsers — a large share of traffic from IG/LINE posts.
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 331.0.0.37.90',
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Line/14.10.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/468.0.0.47.108]',
];

describe('crawler User-Agent filter', () => {
  it('drops every crawler seen in the log', () => {
    for (const ua of CRAWLERS) {
      assert.ok(CRAWLER_UA.test(ua), `should have matched: ${ua}`);
    }
  });

  it('counts real readers', () => {
    for (const ua of HUMANS) {
      assert.ok(!CRAWLER_UA.test(ua), `should NOT have matched: ${ua}`);
    }
  });

  it('treats a missing User-Agent as human, so the filter fails open', () => {
    // v_ua is NULL when PostgREST does not expose the header; in plpgsql
    // `NULL ~* '...'` is NULL and the `if` does not fire. Mirrored here as the
    // empty string, which is what a header-less request yields in JS.
    assert.ok(!CRAWLER_UA.test(''));
  });

  it('documents the known CUBOT false positive rather than pretending it away', () => {
    // Accepted in the migration header: bare 'bot' substring. If this ever
    // starts mattering, that comment is where the fix is described.
    assert.ok(CRAWLER_UA.test('Mozilla/5.0 (Linux; Android 10; CUBOT_X30) Mobile Safari/537.36'));
  });
});
