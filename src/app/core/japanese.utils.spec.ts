import { kanaVariants, romajiToHiragana } from './japanese.utils';

describe('romajiToHiragana', () => {
  it('converts basic and digraph syllables', () => {
    expect(romajiToHiragana('ore')).toBe('おれ');
    expect(romajiToHiragana('sakura')).toBe('さくら');
    expect(romajiToHiragana('shoujo')).toBe('しょうじょ');
  });

  it('handles 促音 and 撥音', () => {
    expect(romajiToHiragana('nippon')).toBe('にっぽん');
    expect(romajiToHiragana('konya')).toBe('こにゃ');
  });

  it('keeps unmapped characters so the result is never empty', () => {
    expect(romajiToHiragana('akb48')).toContain('48');
    expect(romajiToHiragana('')).toBe('');
  });
});

describe('kanaVariants', () => {
  it('adds kana readings for a romaji query', () => {
    expect(kanaVariants('ore')).toEqual(['ore', 'おれ', 'オレ']);
  });

  it('leaves a japanese query on the original kana behaviour', () => {
    expect(kanaVariants('おれ')).toEqual(['おれ', 'オレ']);
  });

  it('does not romanize a single letter', () => {
    expect(kanaVariants('a')).toEqual(['a']);
  });
});
