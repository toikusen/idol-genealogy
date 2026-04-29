import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import {
  Company,
  Group,
  GroupSong,
  GroupVideo,
  History,
  Member,
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
    const member = requestedId
      ? await memberService.getById(requestedId)
      : requestedHandle
        ? await memberService.getByHandle(requestedHandle)
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

    return {
      requestedId,
      requestedHandle,
      member,
      histories,
      companyName: company?.name ?? null,
      companyId: member.company_id,
      allGroupsList: groups
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
    const [group, teams, histories, videos] = await Promise.all([
      groupService.getById(id),
      groupService.getTeamsByGroup(id),
      historyService.getByGroup(id),
      groupService.getVideosByGroup(id),
    ]);

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

    const memberIds = [...new Set(histories.map(h => h.member_id).filter((memberId): memberId is string => !!memberId))];

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
      histories,
      allMemberHistories,
      videos,
      similarGroups,
      allMembers: allMembers
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
    const [company, groups, soloMembers, proposals] = await Promise.all([
      companyService.getById(id),
      companyService.getGroupsByCompany(id),
      companyService.getMembersByCompany(id),
      proposalService.getApprovedByRecord('companies', id).catch(() => []),
    ]);

    return {
      id,
      company,
      activeGroups: groups.filter(g => !g.disbanded_at || new Date(g.disbanded_at) > new Date()),
      disbandedGroups: groups.filter(g => !!g.disbanded_at && new Date(g.disbanded_at) <= new Date()),
      soloMembers,
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
