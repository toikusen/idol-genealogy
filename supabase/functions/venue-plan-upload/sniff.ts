export const MAX_BYTES = 15 * 1024 * 1024;

export interface FileKind {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  ext: 'jpg' | 'png' | 'webp' | 'pdf';
}

/** Real file type from the leading bytes; the browser's MIME type and the file name are not trusted. */
export function sniff(b: Uint8Array): FileKind | null {
  const at = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && at(1, 'PNG\r\n')) return { mime: 'image/png', ext: 'png' };
  if (at(0, 'RIFF') && at(8, 'WEBP')) return { mime: 'image/webp', ext: 'webp' };
  if (at(0, '%PDF-')) return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

/** Optional free-text field: trimmed, capped, empty → null. */
export function field(v: FormDataEntryValue | null, max: number): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s);
