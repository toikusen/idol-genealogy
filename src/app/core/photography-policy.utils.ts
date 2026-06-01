import { PhotographyPolicyStatus } from '../models';

export function photographyBadgeColor(status: PhotographyPolicyStatus | null): string {
  switch (status) {
    case 'allowed':     return 'rgba(34,197,94,0.12)';
    case 'not_allowed': return 'rgba(239,68,68,0.12)';
    case 'conditional': return 'rgba(251,191,36,0.12)';
    default:            return 'transparent';
  }
}

export function photographyBadgeTextColor(status: PhotographyPolicyStatus | null): string {
  switch (status) {
    case 'allowed':     return '#4ade80';
    case 'not_allowed': return '#f87171';
    case 'conditional': return '#fbbf24';
    default:            return 'var(--text-faint-55)';
  }
}

export function photographyBadgeBorderColor(status: PhotographyPolicyStatus | null): string {
  switch (status) {
    case 'allowed':     return 'rgba(34,197,94,0.25)';
    case 'not_allowed': return 'rgba(239,68,68,0.25)';
    case 'conditional': return 'rgba(251,191,36,0.25)';
    default:            return 'transparent';
  }
}

export function photographyStatusLabel(
  status: PhotographyPolicyStatus | null,
  type: 'photo' | 'video',
): string {
  if (!status) return '';
  if (type === 'photo') {
    switch (status) {
      case 'allowed':     return '可拍';
      case 'not_allowed': return '不可拍';
      case 'conditional': return '條件式';
      default:            return '';
    }
  }
  switch (status) {
    case 'allowed':     return '可錄';
    case 'not_allowed': return '不可錄';
    case 'conditional': return '條件式';
    default:            return '';
  }
}
