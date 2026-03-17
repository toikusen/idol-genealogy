// src/app/pages/admin/admin-proposals/admin-proposals.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProposalService } from '../../../core/proposal.service';
import { Proposal } from '../../../models';

@Component({
  selector: 'app-admin-proposals',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-proposals.component.html',
})
export class AdminProposalsComponent implements OnInit {
  proposals: Proposal[] = [];
  loading = true;
  error = '';
  activeStatus: 'pending' | 'approved' | 'rejected' = 'pending';
  readonly statusTabs: { key: 'pending' | 'approved' | 'rejected'; label: string }[] = [
    { key: 'pending', label: '待審核' },
    { key: 'approved', label: '已核准' },
    { key: 'rejected', label: '已拒絕' },
  ];

  constructor(private proposalService: ProposalService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      this.proposals = await this.proposalService.getAll(this.activeStatus);
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

  relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m} 分鐘前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小時前`;
    return `${Math.floor(h / 24)} 天前`;
  }
}
