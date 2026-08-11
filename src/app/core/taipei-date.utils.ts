/**
 * Taiwan has no daylight saving, so Asia/Taipei is a fixed UTC+8 offset.
 * Prerender runs on Cloudflare in UTC; without pinning the zone the 90-day
 * window, the day grouping and the weekday labels all shift by 8 hours and
 * the SSR output stops matching what the browser renders.
 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Midnight in Taipei for the day `date` falls on, as a UTC instant. */
export function taipeiStartOfDay(date: Date = new Date()): Date {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  return new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - TAIPEI_OFFSET_MS);
}

/** `YYYY-MM-DD` in Taipei — the grouping key for the schedule rail. */
export function taipeiDayKey(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + TAIPEI_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

export interface TaipeiDateParts {
  /** Zero-padded month, e.g. `08`. */
  month: string;
  /** Zero-padded day, e.g. `15`. */
  day: string;
  /** Localised weekday, e.g. `週六`. */
  weekday: string;
}

export function taipeiDateParts(iso: string): TaipeiDateParts {
  const shifted = new Date(new Date(iso).getTime() + TAIPEI_OFFSET_MS);
  const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  return {
    month: String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    day: String(shifted.getUTCDate()).padStart(2, '0'),
    weekday: WEEKDAYS[shifted.getUTCDay()],
  };
}

/** `HH:mm` in Taipei. */
export function taipeiTime(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + TAIPEI_OFFSET_MS);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}
