// src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProposalService } from '../../../core/proposal.service';
import { MemberService } from '../../../core/member.service';
import { GroupService } from '../../../core/group.service';
import { PROPOSAL_ALLOWED_FIELDS, FIELD_LABELS } from '../../../core/proposal-fields.config';
import { normalizeHistoryNameAtTime } from '../../../core/history-name-at-time.utils';
import { Proposal } from '../../../models';

@Component({
  selector: 'app-admin-proposal-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-proposal-review.component.html',
})
export class AdminProposalReviewComponent implements OnInit {
  proposal: Proposal | null = null;
  memberMap = new Map<string, string>();
  currentMemberNameMap = new Map<string, string>();
  groupMap = new Map<string, string>();
  loading = true;
  error = '';
  saving = false;
  rejectNote = '';
  showRejectForm = false;

  /** Editable copy of proposed_data for inline editing before approval */
  editedData: Record<string, any> = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private proposalService: ProposalService,
    private memberService: MemberService,
    private groupService: GroupService,
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      this.proposal = await this.proposalService.getById(id);
      if (this.proposal) {
        this.editedData = { ...this.proposal.proposed_data };
        if (this.proposal.table_name === 'history') {
          const [members, groups] = await Promise.all([
            this.memberService.getAll(),
            this.groupService.getAll(),
          ]);
          for (const m of members) {
            this.memberMap.set(m.id, m.name ?? m.name_roman ?? m.id);
            this.currentMemberNameMap.set(m.id, m.name);
          }
          for (const g of groups) {
            this.groupMap.set(g.id, g.name_jp ?? g.name ?? g.id);
          }
        }
      }
    } catch (e: any) {
      this.error = e.message ?? '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  resolveId(field: string, value: any): string {
    if (field === 'member_id' && value && this.memberMap.has(value)) {
      return this.memberMap.get(value)!;
    }
    if (field === 'group_id' && value && this.groupMap.has(value)) {
      return this.groupMap.get(value)!;
    }
    return value ?? '—';
  }

  get historySubject(): string {
    // For DELETE proposals, use original_data; otherwise prefer proposed_data
    const src = (this.proposal?.operation === 'DELETE')
      ? (this.proposal?.original_data ?? {})
      : (this.proposal?.proposed_data ?? this.proposal?.original_data ?? {});
    const group = src['group_id'] ? (this.groupMap.get(src['group_id']) ?? src['group_id'])
      : (src['external_group_name'] ?? null);
    const member = src['member_id'] ? (this.memberMap.get(src['member_id']) ?? src['member_id']) : null;
    if (group && member) return `${group} · ${member}`;
    return group ?? member ?? '—';
  }

  get fields(): string[] {
    if (!this.proposal) return [];
    return PROPOSAL_ALLOWED_FIELDS[this.proposal.table_name] ?? [];
  }

  /** Key-value pairs from original_data for DELETE proposal display */
  get deleteOriginalEntries(): { key: string; value: any }[] {
    const src = this.proposal?.original_data ?? {};
    return this.fields
      .filter(f => src[f] != null && src[f] !== '')
      .map(f => ({ key: f, value: src[f] }));
  }

  fieldLabel(field: string): string {
    if (!this.proposal) return field;
    return FIELD_LABELS[this.proposal.table_name]?.[field] ?? field;
  }

  original(field: string): any {
    return this.proposal?.original_data?.[field] ?? '';
  }

  proposed(field: string): any {
    return this.proposal?.proposed_data?.[field] ?? '';
  }

  isChanged(field: string): boolean {
    return JSON.stringify(this.original(field)) !== JSON.stringify(this.proposed(field));
  }

  tableLabel(t: string): string {
    return { members: '成員', groups: '團體', history: '歷程', companies: '公司' }[t] ?? t;
  }

  async approve() {
    if (!this.proposal) return;
    this.saving = true;
    this.error = '';
    try {
      // DELETE proposals: never pass editedData (proposed_data is just { reason } metadata)
      let reviewedData: Record<string, any> | undefined;
      if (this.proposal.operation !== 'DELETE') {
        const normalizedData = this.normalizedHistoryData(this.editedData);
        const hasEdits = JSON.stringify(normalizedData) !== JSON.stringify(this.proposal.proposed_data);
        reviewedData = hasEdits ? normalizedData : undefined;
      }
      await this.proposalService.approve(this.proposal, reviewedData);
      this.router.navigate(['/admin/proposals']);
    } catch (e: any) {
      this.error = e.message ?? '操作失敗';
    } finally {
      this.saving = false;
    }
  }

  private normalizedHistoryData(data: Record<string, any>): Record<string, any> {
    if (
      this.proposal?.table_name !== 'history'
      || !Object.prototype.hasOwnProperty.call(data, 'name_at_time')
    ) {
      return data;
    }

    const memberId = data['member_id'] ?? this.proposal.original_data?.['member_id'];
    const currentMemberName = memberId ? this.currentMemberNameMap.get(memberId) : undefined;
    return {
      ...data,
      name_at_time: normalizeHistoryNameAtTime(data['name_at_time'], currentMemberName),
    };
  }

  async reject() {
    if (!this.proposal) return;
    this.saving = true;
    this.error = '';
    try {
      await this.proposalService.reject(this.proposal.id, this.rejectNote || undefined);
      this.router.navigate(['/admin/proposals']);
    } catch (e: any) {
      this.error = e.message ?? '操作失敗';
    } finally {
      this.saving = false;
    }
  }
}
