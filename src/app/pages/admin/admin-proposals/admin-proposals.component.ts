// src/app/pages/admin/admin-proposals/admin-proposals.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProposalService } from '../../../core/proposal.service';
import { MemberService } from '../../../core/member.service';
import { Proposal } from '../../../models';

@Component({
  selector: 'app-admin-proposals',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-proposals.component.html',
})
export class AdminProposalsComponent implements OnInit {
  proposals: Proposal[] = [];
  memberMap = new Map<string, string>();
  loading = true;
  error = '';
  activeStatus: 'pending' | 'approved' | 'rejected' = 'pending';
  readonly statusTabs: { key: 'pending' | 'approved' | 'rejected'; label: string }[] = [
    { key: 'pending', label: '待審核' },
    { key: 'approved', label: '已核准' },
    { key: 'rejected', label: '已拒絕' },
  ];

  constructor(private proposalService: ProposalService, private memberService: MemberService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      this.proposals = await this.proposalService.getAll(this.activeStatus);
      const hasHistory = this.proposals.some(p => p.table_name === 'history');
      if (hasHistory && this.memberMap.size === 0) {
        const members = await this.memberService.getAll();
        for (const m of members) {
          this.memberMap.set(m.id, m.name ?? m.name_roman ?? m.id);
        }
      }
    } catch (e: any) {
      this.error = e.message ?? '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  async setStatus(s: 'pending' | 'approved' | 'rejected') {
    this.activeStatus = s;
    await this.load();
  }

  tableLabel(t: string): string {
    return { members: '成員', groups: '組合', history: '歷程', companies: '公司' }[t] ?? t;
  }

  operationLabel(op: string): string {
    return op === 'INSERT' ? '新增' : '修改';
  }

  operationClass(op: string): string {
    return op === 'INSERT'
      ? 'bg-green-100 text-green-700'
      : 'bg-blue-100 text-blue-700';
  }

  recordName(p: Proposal): string {
    const src = p.original_data ?? p.proposed_data ?? {};
    switch (p.table_name) {
      case 'members':
        return src['name'] ?? src['name_roman'] ?? '—';
      case 'groups':
        return src['name'] ?? src['name_jp'] ?? '—';
      case 'companies':
        return src['name'] ?? '—';
      case 'history': {
        const memberId = src['member_id'];
        const memberName = memberId ? (this.memberMap.get(memberId) ?? null) : null;
        const atTime = src['name_at_time'];
        if (memberName && atTime && memberName !== atTime) return `${memberName}（${atTime}）`;
        return memberName ?? atTime ?? '—';
      }
      default:
        return '—';
    }
  }

  relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m} 分鐘前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小時前`;
    return `${Math.floor(h / 24)} 天前`;
  }
}
