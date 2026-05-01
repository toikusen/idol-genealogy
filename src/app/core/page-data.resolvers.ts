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
import { GroupSongService } from './group-song.service';
import { HistoryService } from './history.service';
import { MemberService } from './member.service';
import { MemberSongService } from './member-song.service';
import { ProposalService } from './proposal.service';
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
  allGroups: Group[];
  allCompanies: Company[];
  topMembers: MemberLeaderboardEntry[];
  topGroups: GroupLeaderboardEntry[];
  upcomingBirthdays: { member: Member; daysUntil: number }[];
  allSoloMembers: Member[];
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
  const groupService = inject(GroupService);
  const companyService = inject(CompanyService);
  const proposalService = inject(ProposalService);
  const memberSongService = inject(MemberSongService);

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
        requestedId,
        requestedHandle,
        member: null,
        histories: [],
        companyName: null,
        companyId: null,
        allGroupsList: [],
        lastProposal: null,
        memberSongs: [],
        error: false,
      };
    }

    const [histories, groups, company, proposals, memberSongs] = await Promise.all([
      historyService.getByMember(member.id),
      groupService.getAll().catch(() => []),
      member.company_id ? companyService.getById(member.company_id).catch(() => null) : Promise.resolve(null),
      proposalService.getApprovedByRecord('members', member.id).catch(() => []),
      memberSongService.getByMember(member.id).catch(() => []),
    ]);
    const publicHistories = histories.filter(h => !h.group || isPublicGroupRecord(h.group));
    const publicCompany = company && isPublicCompanyRecord(company) ? company : null;

    return {
      requestedId,
      requestedHandle,
      member,
      histories: publicHistories,
      companyName: publicCompany?.name ?? null,
      companyId: publicCompany ? member.company_id : null,
      allGroupsList: groups
        .filter(isPublicGroupRecord)
        .map(g => ({ id: g.id, name: g.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')),
      lastProposal: proposals[0] ?? null,
      memberSongs,
      error: false,
    };
  } catch {
    return {
      requestedId,
      requestedHandle,
      member: null,
      histories: [],
      companyName: null,
      companyId: null,
      allGroupsList: [],
      lastProposal: null,
      memberSongs: [],
      error: true,
    };
  }
};

export const groupPageResolver: ResolveFn<GroupPageData> = async (route) => {
  const groupService = inject(GroupService);
  const historyService = inject(HistoryService);
  const memberService = inject(MemberService);
  const companyService = inject(CompanyService);
  const proposalService = inject(ProposalService);
  const groupSongService = inject(GroupSongService);

  const id = route.paramMap.get('id') ?? '';

  try {
    const [rawGroup, teams, histories, videos] = await Promise.all([
      groupService.getById(id),
      groupService.getTeamsByGroup(id),
      historyService.getByGroup(id),
      groupService.getVideosByGroup(id),
    ]);
    const group = rawGroup && isPublicGroupRecord(rawGroup)
      ? sanitizePublicGroupRecord(rawGroup)
      : null;

    if (!group) {
      return {
        id,
        group: null,
        companyName: null,
        teams,
        histories,
        allMemberHistories: [],
        videos,
        similarGroups: [],
        allMembers: [],
        lastProposal: null,
        songs: [],
        error: false,
      };
    }

    const publicHistories = histories.filter(h => !h.member || isPublicMemberRecord(h.member));
    const memberIds = [...new Set(publicHistories.map(h => h.member_id).filter((memberId): memberId is string => !!memberId))];

    const [company, proposals, allMemberHistories, allMembers, similarGroups, songs] = await Promise.all([
      group.company_id ? companyService.getById(group.company_id).catch(() => null) : Promise.resolve(null),
      proposalService.getApprovedByRecord('groups', id).catch(() => []),
      historyService.getByMembers(memberIds).catch(() => []),
      memberService.getAll().catch(() => []),
      group.style ? groupService.getSimilarByStyle(group.style.split(','), id).catch(() => []) : Promise.resolve([]),
      groupSongService.getByGroup(id).catch(() => []),
    ]);

    return {
      id,
      group,
      companyName: company?.name ?? null,
      teams,
      histories: publicHistories,
      allMemberHistories: allMemberHistories.filter(h =>
        (!h.member || isPublicMemberRecord(h.member)) && (!h.group || isPublicGroupRecord(h.group))
      ),
      videos,
      similarGroups: similarGroups.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord),
      allMembers: allMembers
        .filter(isPublicMemberRecord)
        .map(m => ({ id: m.id, name: m.name ?? m.name_roman ?? m.id }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')),
      lastProposal: proposals[0] ?? null,
      songs,
      error: false,
    };
  } catch {
    return {
      id,
      group: null,
      companyName: null,
      teams: [],
      histories: [],
      allMemberHistories: [],
      videos: [],
      similarGroups: [],
      allMembers: [],
      lastProposal: null,
      songs: [],
      error: true,
    };
  }
};

export const companyPageResolver: ResolveFn<CompanyPageData> = async (route) => {
  const companyService = inject(CompanyService);
  const proposalService = inject(ProposalService);

  const id = route.paramMap.get('id') ?? '';

  try {
    const [rawCompany, groups, soloMembers, proposals] = await Promise.all([
      companyService.getById(id),
      companyService.getGroupsByCompany(id),
      companyService.getMembersByCompany(id),
      proposalService.getApprovedByRecord('companies', id).catch(() => []),
    ]);
    const company = rawCompany && isPublicCompanyRecord(rawCompany)
      ? sanitizePublicCompanyRecord(rawCompany)
      : null;

    if (!company) {
      return {
        id,
        company: null,
        activeGroups: [],
        disbandedGroups: [],
        soloMembers: [],
        lastProposal: null,
        error: false,
      };
    }

    const publicGroups = groups.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord);
    const publicSoloMembers = soloMembers.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord);

    return {
      id,
      company,
      activeGroups: publicGroups.filter(g => !g.disbanded_at || new Date(g.disbanded_at) > new Date()),
      disbandedGroups: publicGroups.filter(g => !!g.disbanded_at && new Date(g.disbanded_at) <= new Date()),
      soloMembers: publicSoloMembers,
      lastProposal: proposals[0] ?? null,
      error: false,
    };
  } catch {
    return {
      id,
      company: null,
      activeGroups: [],
      disbandedGroups: [],
      soloMembers: [],
      lastProposal: null,
      error: true,
    };
  }
};

export const homePageResolver: ResolveFn<HomePageData> = async () => {
  const memberService = inject(MemberService);
  const groupService = inject(GroupService);
  const companyService = inject(CompanyService);

  const [allMembers, allGroups, allCompanies, topMembers, topGroups, upcomingBirthdays, allSoloMembers] = await Promise.all([
    memberService.getAll().catch(() => [] as Member[]),
    groupService.getAll().catch(() => [] as Group[]),
    companyService.getAll().catch(() => [] as Company[]),
    memberService.getTopByViews(5).catch(() => [] as MemberLeaderboardEntry[]),
    groupService.getTopByViews(5).catch(() => [] as GroupLeaderboardEntry[]),
    memberService.getUpcomingBirthdays(30).catch(() => [] as { member: Member; daysUntil: number }[]),
    memberService.getSoloMembers().catch(() => [] as Member[]),
  ]);

  const publicMembers = allMembers.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord);
  const publicGroups = allGroups.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord);
  const publicCompanies = allCompanies.filter(isPublicCompanyRecord).map(sanitizePublicCompanyRecord);

  return {
    recentMembers: [...publicMembers]
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
      .slice(0, 10),
    memberCount: publicMembers.length,
    allGroups: publicGroups,
    allCompanies: publicCompanies,
    topMembers: topMembers.filter(isPublicMemberRecord),
    topGroups: topGroups.filter(isPublicGroupRecord),
    upcomingBirthdays: upcomingBirthdays.filter(entry => isPublicMemberRecord(entry.member)),
    allSoloMembers: allSoloMembers.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord),
  };
};

export const membersListResolver: ResolveFn<MembersListPageData> = async () => {
  const memberService = inject(MemberService);
  const groupService = inject(GroupService);
  const historyService = inject(HistoryService);

  try {
    const [members, groups, links] = await Promise.all([
      memberService.getAll(),
      groupService.getAll(),
      historyService.getMemberGroupLinks(),
    ]);
    const publicMembers = members.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord);
    const publicGroups = groups.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord);
    const publicMemberIds = new Set(publicMembers.map(member => member.id));
    const publicGroupIds = new Set(publicGroups.map(group => group.id));

    return {
      members: publicMembers,
      groups: publicGroups,
      links: links.filter(link => publicMemberIds.has(link.member_id) && publicGroupIds.has(link.group_id)),
      error: false,
    };
  } catch {
    return {
      members: [],
      groups: [],
      links: [],
      error: true,
    };
  }
};
