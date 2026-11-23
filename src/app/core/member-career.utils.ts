import { History } from '../models';

const ENDED_STATUSES = new Set(['graduated', 'transferred', 'withdrawn']);

/** True when the member has history and every entry has ended (graduated/transferred/withdrawn). */
export const hasCareerEnded = (histories: Pick<History, 'status'>[]): boolean =>
  histories.length > 0 && histories.every(h => ENDED_STATUSES.has(h.status ?? ''));
