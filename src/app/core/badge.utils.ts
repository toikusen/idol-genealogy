export interface Badge {
  icon: string;
  image: string;
  name: string;
  threshold: number;
}

export const BADGES: Badge[] = [
  { icon: '🌱', image: 'badges/badge-1-sprout.png',      name: '新芽',       threshold: 1   },
  { icon: '⭐', image: 'badges/badge-2-beginner.png',    name: '初心者',     threshold: 20  },
  { icon: '💫', image: 'badges/badge-3-contributor.png', name: '貢獻者',     threshold: 50  },
  { icon: '✨', image: 'badges/badge-4-veteran.png',     name: '資深貢獻者',  threshold: 200 },
  { icon: '👑', image: 'badges/badge-5-legend.png',      name: '傳說級',     threshold: 500 },
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
