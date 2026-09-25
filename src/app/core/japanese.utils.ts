/** Convert katakana → hiragana */
export function toHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Convert hiragana → katakana */
export function toKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, c =>
    String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** Hepburn (+ common kunrei variants) romaji → hiragana, longest match first. */
const ROMAJI: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wo: 'を', n: 'ん',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
};

/**
 * Convert romaji to hiragana. Unmapped characters are kept verbatim, so the
 * result is never empty (an empty variant would make an ilike match everything).
 */
export function romajiToHiragana(input: string): string {
  const s = input.toLowerCase();
  let out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    // 促音: doubled consonant (kk, tt, ...)
    if (c === s[i + 1] && !'aiueon'.includes(c)) {
      out += 'っ'; i++; continue;
    }
    // 撥音: n that does not start a syllable
    if (c === 'n' && !/[aiueoy]/.test(s[i + 1] ?? '')) {
      out += 'ん'; i++; continue;
    }
    const hit = [3, 2, 1].map(len => s.slice(i, i + len)).find(k => ROMAJI[k]);
    if (hit) { out += ROMAJI[hit]; i += hit.length; continue; }
    out += c; i++;
  }
  return out;
}

/**
 * Return unique kana variants of a string: original, all-hiragana, all-katakana.
 * A pure-ASCII query is read as romaji first, so "ore" also matches おれ / オレ.
 * Useful for building OR search clauses that match regardless of kana type.
 */
export function kanaVariants(str: string): string[] {
  // ponytail: romaji only helps kana names; kanji names need a stored reading.
  const kana = /^[a-z]{2,}$/i.test(str) ? romajiToHiragana(str) : str;
  return [...new Set([str, toHiragana(kana), toKatakana(kana)])];
}
