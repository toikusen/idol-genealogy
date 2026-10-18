export const CATEGORIES = ['venue', 'idea', 'bug', 'other'] as const;
export type Category = typeof CATEGORIES[number];

export interface Feedback {
  venue: string;
  category: Category;
  message: string;
  contact: string | null;
  pageState: string | null;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Validated feedback from the raw JSON body, or an error message for the user.
 * `spam: true` means a bot tripped a trap: the caller answers "ok" and drops it.
 */
export type RawFeedback = { [k in 'website' | 'elapsed_ms' | 'venue' | 'category' | 'message' | 'contact' | 'page_state']?: unknown };

export function checkFeedback(b: RawFeedback): { ok: Feedback } | { error: string } | { spam: true } {
  // honeypot field hidden from people, and a form sent faster than anyone can type
  if (str(b.website, 200)) return { spam: true };
  if (typeof b.elapsed_ms !== 'number' || b.elapsed_ms < 3000) return { spam: true };

  const venue = str(b.venue, 41);
  if (!/^[a-z0-9-]{1,40}$/.test(venue)) return { error: '場館資料錯誤，請重新整理頁面' };
  const category = str(b.category, 10) as Category;
  if (!CATEGORIES.includes(category)) return { error: '請選擇回報類型' };
  if (typeof b.message === 'string' && b.message.trim().length > 500) return { error: '內容最多 500 字' };
  const message = str(b.message, 500);
  if ([...message].length < 5) return { error: '請多寫一點（至少 5 個字）' };
  if (new Set(message.replace(/\s/g, '')).size < 3) return { error: '請描述具體內容' };
  if ((message.match(/https?:\/\//g) ?? []).length > 2) return { error: '連結太多了，最多 2 個' };
  const contact = str(b.contact, 100) || null;
  const pageState = str(b.page_state, 600) || null;
  return { ok: { venue, category, message, contact, pageState } };
}

/** Same text with spacing and case ignored, so trivial edits still count as a repeat. */
export const normalizeMessage = (m: string) => m.toLowerCase().replace(/[\s\p{P}]+/gu, '');
