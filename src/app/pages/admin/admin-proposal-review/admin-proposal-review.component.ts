// src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProposalService } from '../../../core/proposal.service';
import { PROPOSAL_ALLOWED_FIELDS, FIELD_LABELS } from '../../../core/proposal-fields.config';
import { Proposal } from '../../../models';

@Component({
  selector: 'app-admin-proposal-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-proposal-review.component.html',
})
export class AdminProposalReviewComponent implements OnInit {
  proposal: Proposal | null = null;
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
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      this.proposal = await this.proposalService.getById(id);
      if (this.proposal) {
        this.editedData = { ...this.proposal.proposed_data };
      }
    } catch (e: any) {
      this.error = e.message ?? '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  get fields(): string[] {
    if (!this.proposal) return [];
    return PROPOSAL_ALLOWED_FIELDS[this.proposal.table_name] ?? [];
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
    return { members: '成員', groups: '組合', history: '歷程', companies: '公司' }[t] ?? t;
  }

  async approve() {
    if (!this.proposal) return;
    this.saving = true;
    this.error = '';
    try {
      const hasEdits = JSON.stringify(this.editedData) !== JSON.stringify(this.proposal.proposed_data);
      await this.proposalService.approve(
        this.proposal,
        hasEdits ? this.editedData : undefined,
      );
      this.router.navigate(['/admin/proposals']);
    } catch (e: any) {
      this.error = e.message ?? '操作失敗';
    } finally {
      this.saving = false;
    }
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
