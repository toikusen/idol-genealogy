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

/**
 * Return unique kana variants of a string: original, all-hiragana, all-katakana.
 * Useful for building OR search clauses that match regardless of kana type.
 */
export function kanaVariants(str: string): string[] {
  return [...new Set([str, toHiragana(str), toKatakana(str)])];
}
