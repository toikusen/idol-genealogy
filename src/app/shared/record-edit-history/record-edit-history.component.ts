import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Proposal } from '../../models';
import { ProposalService } from '../../core/proposal.service';
import { getDiffFields, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';

@Component({
  selector: 'app-record-edit-history',
  standalone: true,
  imports: [],
  templateUrl: './record-edit-history.component.html',
})
export class RecordEditHistoryComponent implements OnInit {
  @Input({ required: true }) tableName!: string;
  @Input({ required: true }) recordId!: string;
  @Input({ required: true }) recordLabel!: string;
  @Output() closed = new EventEmitter<void>();

  proposals: Proposal[] = [];
  loading = true;
  error = false;

  constructor(private proposalService: ProposalService) {}

  async ngOnInit() {
    try {
      this.proposals = await this.proposalService.getApprovedByRecord(
        this.tableName, this.recordId
      );
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  getDiffFields(p: Proposal): DiffField[] {
    return getDiffFields(p);
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }
}
