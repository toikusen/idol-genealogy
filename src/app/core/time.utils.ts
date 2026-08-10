/**
 * "2015-04-01" → "2015年4月1日". Renders only the precision the value carries,
 * so a legacy "2015-04" stays "2015年4月" instead of inventing a day.
 * Sliced rather than parsed: a date-only string through Date() shifts by
 * timezone and can land on the previous day west of UTC.
 */
export function formatYmd(date: string | null): string {
  if (!date) return '';
  const [year, month, day] = date.slice(0, 10).split('-');
  if (!year) return '';
  if (!month) return `${year}年`;
  if (!day) return `${year}年${+month}月`;
  return `${year}年${+month}月${+day}日`;
}

/**
 * Parses a stored date as local midnight. Timeline charts build their year ticks
 * with `new Date(y, 0, 1)` (local); passing the same string through `new Date()`
 * would read it as UTC and drift the axis by the offset, dropping the first tick
 * east of UTC. Partial dates ("2015", "2015-04") fall back to the first month/day.
 */
export function localDateMs(date: string): number {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).getTime();
}

export function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return '—';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return '剛才';
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  const days = Math.floor(hrs / 24);
  return `${days} 天前`;
}
