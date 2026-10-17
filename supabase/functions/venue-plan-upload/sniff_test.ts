import { assertEquals } from 'jsr:@std/assert@1';
import { field, isEmail, isHttpUrl, sniff } from './sniff.ts';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap(p => (typeof p === 'string' ? [...p].map(c => c.charCodeAt(0)) : p)));

Deno.test('sniff recognises the four allowed types by content', () => {
  assertEquals(sniff(bytes([0xff, 0xd8, 0xff, 0xe0]))?.ext, 'jpg');
  assertEquals(sniff(bytes([0x89], 'PNG\r\n', [0x1a, 0x0a]))?.ext, 'png');
  assertEquals(sniff(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 '))?.ext, 'webp');
  assertEquals(sniff(bytes('%PDF-1.7'))?.ext, 'pdf');
});

Deno.test('sniff rejects everything else, whatever it claims to be', () => {
  assertEquals(sniff(bytes('<svg xmlns="http://www.w3.org/2000/svg">')), null);
  assertEquals(sniff(bytes('<!doctype html><script>')), null);
  assertEquals(sniff(bytes('GIF89a')), null);
  assertEquals(sniff(bytes('RIFF', [0, 0, 0, 0], 'AVI ')), null);
  assertEquals(sniff(new Uint8Array()), null);
});

Deno.test('form helpers trim, cap and validate', () => {
  assertEquals(field('  舞台寬 9m  ', 200), '舞台寬 9m');
  assertEquals(field('   ', 200), null);
  assertEquals(field(null, 200), null);
  assertEquals(field('x'.repeat(300), 200)?.length, 200);
  assertEquals(isEmail('rent@legacy.com.tw'), true);
  assertEquals(isEmail('not an email'), false);
  assertEquals(isHttpUrl('https://www.legacy.com.tw/download/a.pdf'), true);
  assertEquals(isHttpUrl('javascript:alert(1)'), false);
});
