import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogService } from '../../../core/audit-log.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { MemberService } from '../../../core/member.service';
import { GroupService } from '../../../core/group.service';
import { CompanyService } from '../../../core/company.service';
import { FIELD_LABELS } from '../../../core/proposal-fields.config';
import { AuditLog } from '../../../models';

@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-audit-log.component.html',
})
export class AdminAuditLogComponent implements OnInit {
  logs: AuditLog[] = [];
  loading = true;
  error = '';
  filterTable = '';
  filterOperation = '';
  currentUserEmail = '';
  isEditorOnly = false;
  expandedId: string | null = null;
  revertError: { [id: string]: string } = {};
  revertSuccess: { [id: string]: boolean } = {};
  reverting: { [id: string]: boolean } = {};
  showConfirm: string | null = null;

  tableOptions = ['members', 'groups', 'teams', 'history', 'member_songs', 'group_songs'];
  operationOptions = ['INSERT', 'UPDATE', 'DELETE'];

  private userNameMap = new Map<string, string>();
  private memberMap = new Map<string, string>();
  private groupMap = new Map<string, string>();
  private companyMap = new Map<string, string>();

  constructor(
    private auditLog: AuditLogService,
    private adminRole: AdminRoleService,
    private memberService: MemberService,
    private groupService: GroupService,
    private companyService: CompanyService,
  ) {}

  async ngOnInit() {
    const role = await this.adminRole.getCurrentRole();
    this.currentUserEmail = role?.email ?? '';
    this.isEditorOnly = role?.role === 'editor';

    const [roles, members, groups, companies] = await Promise.all([
      this.adminRole.getAll().catch(() => []),
      this.memberService.getAll().catch(() => []),
      this.groupService.getAll().catch(() => []),
      this.companyService.getAll().catch(() => []),
    ]);
    for (const r of roles) {
      if (r.display_name) this.userNameMap.set(r.email, r.display_name);
    }
    for (const m of members) {
      this.memberMap.set(m.id, m.name ?? m.name_roman ?? m.id);
    }
    for (const g of groups) {
      this.groupMap.set(g.id, g.name_jp ?? g.name ?? g.id);
    }
    for (const c of companies) {
      this.companyMap.set(c.id, c.name ?? c.id);
    }
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const filter: any = {};
      if (this.filterTable) filter.table_name = this.filterTable;
      if (this.filterOperation) filter.operation = this.filterOperation;
      this.logs = await this.auditLog.getAll(filter);
    } catch (e: any) {
      this.error = e.message || '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  toggleExpand(id: string) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  getDiff(log: AuditLog): { field: string; label: string; before: string; after: string }[] {
    if (!log.old_data && !log.new_data) return [];
    const fields = new Set([
      ...Object.keys(log.old_data ?? {}),
      ...Object.keys(log.new_data ?? {})
    ]);
    const diffs: { field: string; label: string; before: string; after: string }[] = [];
    for (const f of fields) {
      const before = log.old_data?.[f] ?? null;
      const after = log.new_data?.[f] ?? null;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({
          field: f,
          label: FIELD_LABELS[log.table_name]?.[f] ?? f,
          before: this.resolveValue(f, before),
          after: this.resolveValue(f, after),
        });
      }
    }
    return diffs;
  }

  getRecordLabel(log: AuditLog): string {
    const src = log.new_data ?? log.old_data ?? {};
    switch (log.table_name) {
      case 'members':
        return this.memberMap.get(log.record_id)
          ?? src['name'] ?? src['name_roman'] ?? '—';
      case 'groups':
        return this.groupMap.get(log.record_id)
          ?? src['name_jp'] ?? src['name'] ?? '—';
      case 'companies':
        return this.companyMap.get(log.record_id)
          ?? src['name'] ?? '—';
      case 'history': {
        const member = src['member_id']
          ? (this.memberMap.get(src['member_id']) ?? src['name_at_time'] ?? src['member_id'])
          : null;
        const group = src['group_id']
          ? (this.groupMap.get(src['group_id']) ?? src['group_id'])
          : (src['external_group_name'] ?? null);
        if (member && group) return `${group} · ${member}`;
        return member ?? group ?? '—';
      }
      case 'member_songs': {
        const title = src['title'] ?? null;
        const owner = src['member_id'] ? (this.memberMap.get(src['member_id']) ?? null) : null;
        if (title && owner) return `${title}（${owner}）`;
        return title ?? owner ?? '—';
      }
      case 'group_songs': {
        const title = src['title'] ?? null;
        const owner = src['group_id'] ? (this.groupMap.get(src['group_id']) ?? null) : null;
        if (title && owner) return `${title}（${owner}）`;
        return title ?? owner ?? '—';
      }
      default:
        return '—';
    }
  }

  resolveValue(field: string, value: any): string {
    if (value == null) return '—';
    if (field === 'member_id') return this.memberMap.get(value) ?? value;
    if (field === 'group_id') return this.groupMap.get(value) ?? value;
    if (field === 'company_id') return this.companyMap.get(value) ?? value;
    return String(value);
  }

  tableLabel(t: string): string {
    return {
      members: '成員', groups: '團體', history: '歷程', teams: '企劃', companies: '公司',
      member_songs: '成員原創曲', group_songs: '團體原創曲',
    }[t] ?? t;
  }

  confirmRevert(id: string) {
    this.showConfirm = id;
  }

  cancelRevert() {
    this.showConfirm = null;
  }

  async executeRevert(log: AuditLog) {
    this.showConfirm = null;
    this.reverting[log.id] = true;
    this.revertError[log.id] = '';
    this.revertSuccess[log.id] = false;
    try {
      await this.auditLog.revert(log);
      this.revertSuccess[log.id] = true;
      setTimeout(() => { this.revertSuccess[log.id] = false; }, 3000);
      await this.load();
    } catch (e: any) {
      this.revertError[log.id] = e.message || '還原失敗';
    } finally {
      this.reverting[log.id] = false;
    }
  }

  getOperatorName(log: AuditLog): string {
    if (!log.user_email) return '—';
    return this.userNameMap.get(log.user_email) ?? log.user_email;
  }

  operationLabel(op: string): string {
    return { INSERT: '新增', UPDATE: '編輯', DELETE: '刪除' }[op] ?? op;
  }

  operationClass(op: string): string {
    return {
      INSERT: 'bg-green-100 text-green-700',
      UPDATE: 'bg-blue-100 text-blue-700',
      DELETE: 'bg-red-100 text-red-700'
    }[op] ?? 'bg-gray-100 text-gray-600';
  }

  revertActionLabel(op: string): string {
    return {
      INSERT: '刪除此新增的資料',
      UPDATE: '將資料還原為編輯前的狀態',
      DELETE: '重新插入被刪除的資料'
    }[op] ?? '還原';
  }
}
