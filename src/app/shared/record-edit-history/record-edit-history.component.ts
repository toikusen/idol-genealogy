import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Proposal } from '../../models';
import { ProposalService } from '../../core/proposal.service';
import { CompanyService } from '../../core/company.service';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { getDiffFields, getEffectiveProposed, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';
import { photographyStatusLabel } from '../../core/photography-policy.utils';
import { SupabaseImgPipe } from '../supabase-img.pipe';

@Component({
  selector: 'app-record-edit-history',
  standalone: true,
  imports: [SupabaseImgPipe],
  templateUrl: './record-edit-history.component.html',
  styles: [`
    @media (min-width: 768px) {
      aside {
        top: 50% !important;
        left: 50% !important;
        right: auto !important;
        bottom: auto !important;
        transform: translate(-50%, -50%);
        height: auto !important;
        max-height: 90vh;
        border-left: none !important;
        border-radius: 16px !important;
        border: 1px solid var(--border-subtle);
      }
    }
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
  /** When set, also loads approved history proposals where proposed_data->>{field} = recordId */
  @Input() relatedHistoryField?: 'member_id' | 'group_id';
  /** When set, also loads approved song proposals where proposed_data/original_data carries the owner id */
  @Input() relatedSongTable?: 'member_songs' | 'group_songs';
  @Input() relatedSongField?: 'member_id' | 'group_id';
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
      const [mainProposals, historyProposals, songProposals] = await Promise.all([
        this.proposalService.getApprovedByRecord(this.tableName, this.recordId),
        this.relatedHistoryField
          ? this.proposalService.getApprovedHistoryByField(this.relatedHistoryField, this.recordId).catch(() => [] as Proposal[])
          : Promise.resolve([] as Proposal[]),
        this.relatedSongTable && this.relatedSongField
          ? this.proposalService.getApprovedSongsByField(this.relatedSongTable, this.relatedSongField, this.recordId).catch(() => [] as Proposal[])
          : Promise.resolve([] as Proposal[]),
      ]);

      await Promise.all([
        this.tableName === 'groups' ? this.loadCompanyMap().catch(() => {}) : Promise.resolve(),
        this.relatedHistoryField ? this.loadMemberMap().catch(() => {}) : Promise.resolve(),
        this.relatedHistoryField ? this.loadGroupMap().catch(() => {}) : Promise.resolve(),
      ]);

      const merged = [...mainProposals, ...historyProposals, ...songProposals];
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

  private static readonly HISTORY_STATUS_LABELS: Record<string, string> = {
    active: '正常在籍', concurrent: '兼任', support: '支援',
    hiatus: '活休', transferred: '移籍', graduated: '畢業', withdrawn: '脫退',
  };

  resolveFieldValue(key: string, value: string): string {
    if (value === '—') return value;
    if (key === 'company_id') return this.companyNameMap[value] ?? value;
    if (key === 'group_id') return this.groupNameMap[value] ?? value;
    if (key === 'member_id') return this.memberNameMap[value] ?? value;
    if (key === 'photo_status') return photographyStatusLabel(value as any, 'photo') || value;
    if (key === 'video_status') return photographyStatusLabel(value as any, 'video') || value;
    if (key === 'status') return RecordEditHistoryComponent.HISTORY_STATUS_LABELS[value] ?? value;
    return value;
  }

  getDiffFields(p: Proposal): DiffField[] {
    return getDiffFields(p);
  }

  /** Who/what a merged related-record proposal belongs to (e.g. which member's
   *  history row was edited when viewing a group's history panel). */
  getSubjectLabel(p: Proposal): string | null {
    const data = { ...(p.original_data ?? {}), ...getEffectiveProposed(p) };
    if (p.table_name === 'history') {
      if (this.relatedHistoryField === 'group_id') {
        return this.memberNameMap[data['member_id']] ?? data['name_at_time'] ?? null;
      }
      return this.groupNameMap[data['group_id']] ?? null;
    }
    if (p.table_name === 'member_songs' || p.table_name === 'group_songs') {
      return data['title'] ?? null;
    }
    return null;
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }
}
