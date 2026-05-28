import { TestBed } from '@angular/core/testing';
import { AuditLogService } from './audit-log.service';
import { SupabaseService } from './supabase.service';
import { AdminRoleService } from './admin-role.service';
import { AuditLog } from '../models';

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1',
    table_name: 'members',
    record_id: 'rec-1',
    operation: 'UPDATE',
    user_id: 'uid-1',
    user_email: 'a@b.com',
    old_data: { name: 'Old Name' },
    new_data: { name: 'New Name' },
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('AuditLogService', () => {
  let service: AuditLogService;
  let dbSpy: jasmine.SpyObj<any>;
  let adminRoleSpy: jasmine.SpyObj<AdminRoleService>;
  let supabaseSpy: { client: jasmine.SpyObj<any>; getSessionOnce: jasmine.Spy };

  beforeEach(() => {
    dbSpy = {
      from: jasmine.createSpy('from'),
      rpc: jasmine.createSpy('rpc'),
    };
    adminRoleSpy = jasmine.createSpyObj<AdminRoleService>('AdminRoleService', ['isAdmin']);
    supabaseSpy = {
      client: dbSpy,
      getSessionOnce: jasmine.createSpy('getSessionOnce'),
    };

    TestBed.configureTestingModule({
      providers: [
        AuditLogService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: AdminRoleService, useValue: adminRoleSpy },
      ],
    });
    service = TestBed.inject(AuditLogService);
  });

  it('getAll() returns { data, hasMore: false } when results <= limit', async () => {
    const logs = [makeLog()];
    dbSpy.rpc.and.resolveTo({ data: logs, error: null });

    const result = await service.getAll();

    expect(dbSpy.rpc).toHaveBeenCalledWith('get_audit_logs_paginated', jasmine.any(Object));
    expect(result).toEqual({ data: logs, hasMore: false });
  });

  it('getAll() returns { data: first 50, hasMore: true } when RPC returns 51 rows', async () => {
    const fiftyOneLogs = Array.from({ length: 51 }, (_, i) =>
      makeLog({ id: `log-${i}`, created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z` })
    );
    dbSpy.rpc.and.resolveTo({ data: fiftyOneLogs, error: null });

    const result = await service.getAll();

    expect(result.data.length).toBe(50);
    expect(result.hasMore).toBe(true);
    expect(result.data[0].id).toBe('log-0');
  });

  it('getAll() returns { data: all 50, hasMore: false } when RPC returns exactly 50 rows', async () => {
    const fiftyLogs = Array.from({ length: 50 }, (_, i) =>
      makeLog({ id: `log-${i}`, created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z` })
    );
    dbSpy.rpc.and.resolveTo({ data: fiftyLogs, error: null });

    const result = await service.getAll();

    expect(result.data.length).toBe(50);
    expect(result.hasMore).toBe(false);
  });

  it('getAll() passes all filter params to RPC', async () => {
    dbSpy.rpc.and.resolveTo({ data: [], error: null });
    const cursor = { created_at: '2025-05-01T00:00:00Z', id: 'cursor-id' };

    await service.getAll({
      table_name: 'members',
      operation: 'UPDATE',
      member_id: 'mem-1',
      group_id: 'grp-1',
      date_from: '2025-01-01T00:00:00.000Z',
      date_to: '2025-12-31T00:00:00.000Z',
      cursor,
      limit: 50,
    });

    expect(dbSpy.rpc).toHaveBeenCalledWith('get_audit_logs_paginated', {
      p_table_name:          'members',
      p_operation:           'UPDATE',
      p_member_id:           'mem-1',
      p_group_id:            'grp-1',
      p_date_from:           '2025-01-01T00:00:00.000Z',
      p_date_to:             '2025-12-31T00:00:00.000Z',
      p_cursor_created_at:   '2025-05-01T00:00:00Z',
      p_cursor_id:           'cursor-id',
      p_limit:               51,
    });
  });

  it('getAll() passes nulls when filter is empty', async () => {
    dbSpy.rpc.and.resolveTo({ data: [], error: null });

    await service.getAll();

    expect(dbSpy.rpc).toHaveBeenCalledWith('get_audit_logs_paginated', {
      p_table_name:          null,
      p_operation:           null,
      p_member_id:           null,
      p_group_id:            null,
      p_date_from:           null,
      p_date_to:             null,
      p_cursor_created_at:   null,
      p_cursor_id:           null,
      p_limit:               51,
    });
  });

  it('getAll() throws when RPC returns an error', async () => {
    dbSpy.rpc.and.resolveTo({ data: null, error: { message: 'permission denied' } });

    await expectAsync(service.getAll()).toBeRejectedWith(
      jasmine.objectContaining({ message: 'permission denied' })
    );
  });

  it('canRevertLog() allows admins', async () => {
    adminRoleSpy.isAdmin.and.resolveTo(true);
    await expectAsync(service.canRevertLog(makeLog())).toBeResolvedTo(true);
    expect(supabaseSpy.getSessionOnce).not.toHaveBeenCalled();
  });

  it('canRevertLog() allows the log owner for non-admin users', async () => {
    adminRoleSpy.isAdmin.and.resolveTo(false);
    supabaseSpy.getSessionOnce.and.resolveTo({ user: { email: 'a@b.com' } });
    await expectAsync(service.canRevertLog(makeLog())).toBeResolvedTo(true);
  });

  it('revert() calls the revert_audit_log RPC', async () => {
    dbSpy.rpc.and.resolveTo({ error: null });
    await service.revert(makeLog({ id: 'log-123' }));
    expect(dbSpy.rpc).toHaveBeenCalledWith('revert_audit_log', { p_log_id: 'log-123' });
  });

  it('revert() throws when the RPC returns an error', async () => {
    dbSpy.rpc.and.resolveTo({ error: { message: 'FK violation' } });
    await expectAsync(service.revert(makeLog())).toBeRejectedWithError('FK violation');
  });

  it('getRecord() reads an editable table by id', async () => {
    const record = { id: 'rec-1', name: 'Current Name' };
    const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.resolveTo({ data: record, error: null });
    const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
    const chain = {
      select: jasmine.createSpy().and.returnValue({ eq: eqSpy }),
    };
    dbSpy.from.and.returnValue(chain);

    const result = await service.getRecord('members', 'rec-1');

    expect(dbSpy.from).toHaveBeenCalledWith('members');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(eqSpy).toHaveBeenCalledWith('id', 'rec-1');
    expect(result).toEqual(record);
  });

  it('updateRecord() only sends whitelisted fields', async () => {
    const eqSpy = jasmine.createSpy('eq').and.resolveTo({ error: null });
    const chain = {
      update: jasmine.createSpy().and.returnValue({ eq: eqSpy }),
    };
    dbSpy.from.and.returnValue(chain);

    await service.updateRecord('members', 'rec-1', {
      name: 'Corrected',
      updated_at: 'should-not-pass',
      admin_only: 'nope',
    });

    expect(dbSpy.from).toHaveBeenCalledWith('members');
    expect(chain.update).toHaveBeenCalledWith({ name: 'Corrected' });
    expect(eqSpy).toHaveBeenCalledWith('id', 'rec-1');
  });

  it('updateRecord() rejects unsupported tables', async () => {
    await expectAsync(
      service.updateRecord('user_roles', 'role-1', { role: 'admin' })
    ).toBeRejectedWithError('此資料表不支援在變更記錄中編輯');
  });
});
