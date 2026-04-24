import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Proposal } from '../../models';
import { ProposalService } from '../../core/proposal.service';
import { CompanyService } from '../../core/company.service';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { getDiffFields, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';

@Component({
  selector: 'app-record-edit-history',
  standalone: true,
  imports: [],
  templateUrl: './record-edit-history.component.html',
  styles: [`
    @media (prefers-color-scheme: dark) {
      :host aside {
        background: #160c18 !important;
        border-left-color: rgba(232, 121, 160, 0.15) !important;
        box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45) !important;
      }
    }
  `],
})
export class RecordEditHistoryComponent implements OnInit {
  @Input({ required: true }) tableName!: string;
  @Input({ required: true }) recordId!: string;
  @Input({ required: true }) recordLabel!: string;
  /** When set, also loads approved history proposals where proposed_data->>{field} = recordId */
  @Input() relatedHistoryField?: 'member_id' | 'group_id';
  @Output() closed = new EventEmitter<void>();

  proposals: Proposal[] = [];
  loading = true;
  error = false;

  private companyNameMap: Record<string, string> = {};
  private memberNameMap: Record<string, string> = {};
  private groupNameMap: Record<string, string> = {};

  constructor(
    private proposalService: ProposalService,
    private companyService: CompanyService,
    private memberService: MemberService,
    private groupService: GroupService,
  ) {}

  async ngOnInit() {
    try {
      const [mainProposals, historyProposals] = await Promise.all([
        this.proposalService.getApprovedByRecord(this.tableName, this.recordId),
        this.relatedHistoryField
          ? this.proposalService.getApprovedHistoryByField(this.relatedHistoryField, this.recordId).catch(() => [] as Proposal[])
          : Promise.resolve([] as Proposal[]),
      ]);

      await Promise.all([
        this.tableName === 'groups' ? this.loadCompanyMap().catch(() => {}) : Promise.resolve(),
        this.relatedHistoryField ? this.loadMemberMap().catch(() => {}) : Promise.resolve(),
        this.relatedHistoryField ? this.loadGroupMap().catch(() => {}) : Promise.resolve(),
      ]);

      const merged = [...mainProposals, ...historyProposals];
      merged.sort((a, b) =>
        new Date(b.reviewed_at ?? b.created_at).getTime() -
        new Date(a.reviewed_at ?? a.created_at).getTime()
      );
      this.proposals = merged;
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  private async loadCompanyMap() {
    const items = await this.companyService.getAll();
    for (const c of items) this.companyNameMap[c.id] = c.name;
  }

  private async loadGroupMap() {
    const items = await this.groupService.getAll();
    for (const g of items) this.groupNameMap[g.id] = g.name;
  }

  private async loadMemberMap() {
    const items = await this.memberService.getAll();
    for (const m of items) this.memberNameMap[m.id] = m.name;
  }

  resolveFieldValue(key: string, value: string): string {
    if (value === '—') return value;
    if (key === 'company_id') return this.companyNameMap[value] ?? value;
    if (key === 'group_id') return this.groupNameMap[value] ?? value;
    if (key === 'member_id') return this.memberNameMap[value] ?? value;
    return value;
  }

  getDiffFields(p: Proposal): DiffField[] {
    return getDiffFields(p);
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }
}
