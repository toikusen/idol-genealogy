import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogService } from '../../../core/audit-log.service';
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
  expandedId: string | null = null;
  revertError: { [id: string]: string } = {};
  revertSuccess: { [id: string]: boolean } = {};
  reverting: { [id: string]: boolean } = {};
  showConfirm: string | null = null;

  tableOptions = ['members', 'groups', 'teams', 'history'];
  operationOptions = ['INSERT', 'UPDATE', 'DELETE'];

  constructor(private auditLog: AuditLogService) {}

  async ngOnInit() { await this.load(); }

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

  getDiff(log: AuditLog): { field: string; before: any; after: any }[] {
    if (!log.old_data && !log.new_data) return [];
    const fields = new Set([
      ...Object.keys(log.old_data ?? {}),
      ...Object.keys(log.new_data ?? {})
    ]);
    const diffs: { field: string; before: any; after: any }[] = [];
    for (const f of fields) {
      const before = log.old_data?.[f] ?? null;
      const after = log.new_data?.[f] ?? null;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({ field: f, before, after });
      }
    }
    return diffs;
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
