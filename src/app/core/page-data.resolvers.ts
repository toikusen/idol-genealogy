import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import {
  Company,
  Group,
  GroupLeaderboardEntry,
  GroupSong,
  GroupVideo,
  History,
  Member,
  MemberLeaderboardEntry,
  MemberSong,
  Proposal,
  Team,
} from '../models';
import { CompanyService } from './company.service';
import { GroupService } from './group.service';
import { HistoryService } from './history.service';
import { MemberService } from './member.service';
import {
  isPublicCompanyRecord,
  isPublicGroupRecord,
  isPublicMemberRecord,
  sanitizePublicCompanyRecord,
  sanitizePublicGroupRecord,
  sanitizePublicMemberRecord,
} from './public-record.utils';

export interface HomePageData {
  recentMembers: Member[];
  memberCount: number;
  groupCount: number;
  companyCount: number;
  topMembers: MemberLeaderboardEntry[];
  topGroups: GroupLeaderboardEntry[];
  upcomingBirthdays: { member: Member; daysUntil: number }[];
}

export interface MembersListPageData {
  members: Member[];
  groups: Group[];
  links: { member_id: string; group_id: string }[];
  error: boolean;
}

export interface MemberPageData {
  requestedId: string | null;
  requestedHandle: string | null;
  member: Member | null;
  histories: History[];
  companyName: string | null;
  companyId: string | null;
  allGroupsList: { id: string; name: string }[];
  lastProposal: Proposal | null;
  memberSongs: MemberSong[];
  error: boolean;
}

export interface GroupPageData {
  id: string;
  group: Group | null;
  companyName: string | null;
  teams: Team[];
  histories: History[];
  allMemberHistories: History[];
  videos: GroupVideo[];
  similarGroups: Group[];
  allMembers: { id: string; name: string }[];
  lastProposal: Proposal | null;
  songs: GroupSong[];
  error: boolean;
}

export interface CompanyPageData {
  id: string;
  company: Company | null;
  activeGroups: Group[];
  disbandedGroups: Group[];
  soloMembers: Member[];
  lastProposal: Proposal | null;
  error: boolean;
}

export const memberPageResolver: ResolveFn<MemberPageData> = async (route) => {
  const memberService = inject(MemberService);
  const historyService = inject(HistoryService);
  const companyService = inject(CompanyService);

  const requestedId = route.paramMap.get('id');
  const requestedHandle = route.paramMap.get('handle');

  try {
    const rawMember = requestedId
      ? await memberService.getById(requestedId)
      : requestedHandle
        ? await memberService.getByHandle(requestedHandle)
        : null;
    const member = rawMember && isPublicMemberRecord(rawMember)
      ? sanitizePublicMemberRecord(rawMember)
      : null;

    if (!member) {
      return {
        requestedId, requestedHandle,
        member: null, histories: [], companyName: null, companyId: null,
        allGroupsList: [], lastProposal: null, memberSongs: [], error: false,
      };
    }

    const [histories, company] = await Promise.all([
      historyService.getByMember(member.id),
      member.company_id ? companyService.getById(member.company_id).catch(() => null) : Promise.resolve(null),
    ]);
    const publicHistories = histories.filter(h => !h.group || isPublicGroupRecord(h.group));
    const publicCompany = company && isPublicCompanyRecord(company) ? company : null;

    return {
      requestedId, requestedHandle, member,
      histories: publicHistories,
      companyName: publicCompany?.name ?? null,
      companyId: publicCompany ? member.company_id : null,
      allGroupsList: [],
      lastProposal: null,
      memberSongs: [],
      error: false,
    };
  } catch {
    return {
      requestedId, requestedHandle, member: null, histories: [],
      companyName: null, companyId: null,
      allGroupsList: [], lastProposal: null, memberSongs: [], error: true,
    };
  }
};

export const groupPageResolver: ResolveFn<GroupPageData> = async (route) => {
  const groupService = inject(GroupService);
  const historyService = inject(HistoryService);
  const companyService = inject(CompanyService);

  const id = route.paramMap.get('id') ?? '';

  try {
    const [rawGroup, teams, histories] = await Promise.all([
      groupService.getById(id),
      groupService.getTeamsByGroup(id),
      historyService.getByGroup(id),
    ]);
    const group = rawGroup && isPublicGroupRecord(rawGroup)
      ? sanitizePublicGroupRecord(rawGroup)
      : null;

    if (!group) {
      return {
        id, group: null, companyName: null, teams, histories,
        allMemberHistories: [], videos: [], similarGroups: [],
        allMembers: [], lastProposal: null, songs: [], error: false,
      };
    }

    const publicHistories = histories.filter(h => !h.member || isPublicMemberRecord(h.member));
    const rawCompany = group.company_id
      ? await companyService.getById(group.company_id).catch(() => null)
      : null;
    const companyName = rawCompany && isPublicCompanyRecord(rawCompany) ? rawCompany.name : null;

    return {
      id, group, companyName, teams,
      histories: publicHistories,
      allMemberHistories: [], videos: [], similarGroups: [],
      allMembers: [], lastProposal: null, songs: [], error: false,
    };
  } catch {
    return {
      id, group: null, companyName: null, teams: [], histories: [],
      allMemberHistories: [], videos: [], similarGroups: [],
      allMembers: [], lastProposal: null, songs: [], error: true,
    };
  }
};

export const companyPageResolver: ResolveFn<CompanyPageData> = async (route) => {
  const companyService = inject(CompanyService);

  const id = route.paramMap.get('id') ?? '';

  try {
    const [rawCompany, groups, soloMembers] = await Promise.all([
      companyService.getById(id),
      companyService.getGroupsByCompany(id),
      companyService.getMembersByCompany(id),
    ]);
    const company = rawCompany && isPublicCompanyRecord(rawCompany)
      ? sanitizePublicCompanyRecord(rawCompany)
      : null;

    if (!company) {
      return {
        id, company: null, activeGroups: [], disbandedGroups: [],
        soloMembers: [], lastProposal: null, error: false,
      };
    }

    const publicGroups = groups.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord);
    const publicSoloMembers = soloMembers.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord);

    return {
      id, company,
      activeGroups: publicGroups.filter(g => !g.disbanded_at || new Date(g.disbanded_at) > new Date()),
      disbandedGroups: publicGroups.filter(g => !!g.disbanded_at && new Date(g.disbanded_at) <= new Date()),
      soloMembers: publicSoloMembers,
      lastProposal: null,
      error: false,
    };
  } catch {
    return {
      id, company: null, activeGroups: [], disbandedGroups: [],
      soloMembers: [], lastProposal: null, error: true,
    };
  }
};

export const homePageResolver: ResolveFn<HomePageData> = async () => {
  const memberService = inject(MemberService);
  const groupService = inject(GroupService);
  const companyService = inject(CompanyService);

  const [recentMembers, memberCount, groupCount, companyCount, topMembers, topGroups, upcomingBirthdays] = await Promise.all([
    memberService.getRecent(9).catch(() => [] as Member[]),
    memberService.getCount().catch(() => 0),
    groupService.getPublicCount().catch(() => 0),
    companyService.getPublicCount().catch(() => 0),
    memberService.getTopByViews(5).catch(() => [] as MemberLeaderboardEntry[]),
    groupService.getTopByViews(5).catch(() => [] as GroupLeaderboardEntry[]),
    memberService.getUpcomingBirthdays(30).catch(() => [] as { member: Member; daysUntil: number }[]),
  ]);

  return {
    recentMembers: recentMembers.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord),
    memberCount,
    groupCount,
    companyCount,
    topMembers: topMembers.filter(isPublicMemberRecord),
    topGroups: topGroups.filter(isPublicGroupRecord),
    upcomingBirthdays: upcomingBirthdays.filter(entry => isPublicMemberRecord(entry.member)),
  };
};

export const membersListResolver: ResolveFn<MembersListPageData> = async () => {
  const memberService = inject(MemberService);
  const groupService = inject(GroupService);

  try {
    const [members, groups] = await Promise.all([
      memberService.getAll(),
      groupService.getAll(),
    ]);
    const publicMembers = members.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord);
    const publicGroups = groups.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord);

    return {
      members: publicMembers,
      groups: publicGroups,
      links: [],
      error: false,
    };
  } catch {
    return { members: [], groups: [], links: [], error: true };
  }
};
