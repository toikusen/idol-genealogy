// src/app/shared/graph-utils.ts
import { History } from '../models';

export interface CareerNode {
  historyId: string;
  groupId: string | null;
  memberId: string;
  groupName: string;
  memberName: string;   // name_at_time ?? member.name
  joinedAt: string;     // formatted "YYYY.MM"
  leftAt: string | null;
  isCurrent: boolean;
  routePath: string;    // "/group/:id" or '' for external
  isExternal: boolean;
  externalCountry: string | null;
}

/** Transform history[] (getByMember result) → CareerNode[] */
export function buildCareerGraph(histories: History[], fallbackName = ''): CareerNode[] {
  const sorted = [...histories].sort(
    (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  );

  return sorted.map(h => {
    const isExternal = !h.group_id && !!h.external_group_name;
    return {
      historyId: h.id,
      groupId: h.group_id,
      memberId: h.member_id,
      groupName: isExternal ? (h.external_group_name ?? '—') : (h.group?.name ?? '—'),
      memberName: h.name_at_time || h.member?.name || h.member?.name_roman || fallbackName || '—',
      joinedAt: h.joined_at.slice(0, 7).replaceAll('-', '.'),
      leftAt: h.left_at ? h.left_at.slice(0, 7).replaceAll('-', '.') : null,
      isCurrent: !h.left_at || new Date(h.left_at).getTime() > Date.now(),
      routePath: isExternal ? '' : `/group/${h.group_id}/`,
      isExternal,
      externalCountry: h.external_country ?? null,
    };
  });
}
