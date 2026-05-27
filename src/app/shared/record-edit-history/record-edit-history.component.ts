import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AuditLog, Proposal } from '../../models';
import { ProposalService } from '../../core/proposal.service';
import { AuditLogService } from '../../core/audit-log.service';
import { CompanyService } from '../../core/company.service';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { getDiffFields, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';
import { SupabaseImgPipe } from '../supabase-img.pipe';

interface DisplayEntry {
  id: string;
  table_name: string;
  record_id: string | null;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  proposed_data: Record<string, any>;
  original_data: Record<string, any> | null;
  reviewed_data: Record<string, any> | null;
  submitter_name: string;
  reviewed_at: string | null;
}

@Component({
  selector: 'app-record-edit-history',
  standalone: true,
  imports: [SupabaseImgPipe],
  templateUrl: './record-edit-history.component.html',
  styles: [`
    :host-context([data-theme="dark"]) aside {
      background: var(--bg-page) !important;
      border-left-color: rgba(232, 121, 160, 0.15) !important;
      box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45) !important;
    }
  `],
})
export class RecordEditHistoryComponent implements OnInit {
  @Input({ required: true }) tableName!: string;
  @Input({ required: true }) recordId!: string;
  @Input({ required: true }) recordLabel!: string;
  /** When set, also loads audit_log entries for history records where {field} = recordId */
  @Input() relatedHistoryField?: 'member_id' | 'group_id';
  @Output() closed = new EventEmitter<void>();

  entries: DisplayEntry[] = [];
  loading = true;
  error = false;

  private companyNameMap: Record<string, string> = {};
  private memberNameMap: Record<string, string> = {};
  private groupNameMap: Record<string, string> = {};

  constructor(
    private proposalService: ProposalService,
    private auditLogService: AuditLogService,
    private companyService: CompanyService,
    private memberService: MemberService,
    private groupService: GroupService,
  ) {}

  async ngOnInit() {
    try {
      const [mainProposals, historyAuditLogs] = await Promise.all([
        this.proposalService.getApprovedByRecord(this.tableName, this.recordId),
        this.relatedHistoryField
          ? this.auditLogService.getHistoryLogsByField(this.relatedHistoryField, this.recordId).catch(() => [] as AuditLog[])
          : Promise.resolve([] as AuditLog[]),
      ]);

      await Promise.all([
        this.tableName === 'groups' ? this.loadCompanyMap().catch(() => {}) : Promise.resolve(),
        this.relatedHistoryField ? this.loadMemberMap().catch(() => {}) : Promise.resolve(),
        this.relatedHistoryField ? this.loadGroupMap().catch(() => {}) : Promise.resolve(),
      ]);

      const proposalEntries: DisplayEntry[] = mainProposals.map(p => ({
        id: p.id,
        table_name: p.table_name,
        record_id: p.record_id,
        operation: p.operation,
        proposed_data: p.proposed_data,
        original_data: p.original_data,
        reviewed_data: p.reviewed_data,
        submitter_name: p.submitter_name,
        reviewed_at: p.reviewed_at,
      }));

      const auditEntries: DisplayEntry[] = historyAuditLogs.map(log => ({
        id: log.id,
        table_name: log.table_name,
        record_id: log.record_id,
        operation: log.operation,
        proposed_data: log.new_data ?? {},
        original_data: log.old_data,
        reviewed_data: null,
        submitter_name: '管理員',
        reviewed_at: log.created_at,
      }));

      const merged = [...proposalEntries, ...auditEntries];
      merged.sort((a, b) =>
        new Date(b.reviewed_at ?? '').getTime() -
        new Date(a.reviewed_at ?? '').getTime()
      );
      this.entries = merged;
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

  getDiffFields(p: DisplayEntry): DiffField[] {
    return getDiffFields(p as Proposal);
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }
}
