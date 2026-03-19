export interface Badge {
  icon: string;
  name: string;
  threshold: number;
}

export const BADGES: Badge[] = [
  { icon: '🌱', name: '新芽',       threshold: 1   },
  { icon: '⭐', name: '初心者',     threshold: 10  },
  { icon: '💫', name: '貢獻者',     threshold: 30  },
  { icon: '✨', name: '資深貢獻者',  threshold: 100 },
  { icon: '👑', name: '傳說級',     threshold: 300 },
];

export const TABLE_LABELS: Record<string, string> = {
  members: '成員',
  groups:  '組合',
  companies: '公司',
  history: '歷程',
};

/** Returns the highest unlocked badge for the given approved count, or null if total < 1. */
export function getBadge(total: number): Badge | null {
  let current: Badge | null = null;
  for (const badge of BADGES) {
    if (total >= badge.threshold) current = badge;
  }
  return current;
}

/**
 * Returns the next locked badge and how many more approved proposals are needed,
 * or null if the contributor has reached the maximum tier (300+).
 */
export function getNextBadge(total: number): { badge: Badge; remaining: number } | null {
  for (const badge of BADGES) {
    if (total < badge.threshold) {
      return { badge, remaining: badge.threshold - total };
    }
  }
  return null;
}
