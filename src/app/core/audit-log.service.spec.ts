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

  it('getAll() returns audit log entries ordered by created_at desc', async () => {
    const logs = [makeLog()];
    const chain = {
      select: jasmine.createSpy().and.returnValue({
        order: jasmine.createSpy().and.returnValue({
          limit: jasmine.createSpy().and.returnValue(Promise.resolve({ data: logs, error: null })),
        }),
      }),
    };
    dbSpy.from.and.returnValue(chain);
    const result = await service.getAll();
    expect(result).toEqual(logs);
  });

  it('getAll() applies both table_name and operation filters when both provided', async () => {
    const eqOperationSpy = jasmine.createSpy('eqOperation').and.returnValue({
      order: jasmine.createSpy().and.returnValue({
        limit: jasmine.createSpy().and.returnValue(Promise.resolve({ data: [], error: null })),
      }),
    });
    const eqTableSpy = jasmine.createSpy('eqTable').and.returnValue({ eq: eqOperationSpy });
    const chain = {
      select: jasmine.createSpy().and.returnValue({ eq: eqTableSpy }),
    };
    dbSpy.from.and.returnValue(chain);
    await service.getAll({ table_name: 'members', operation: 'INSERT' });
    expect(eqTableSpy).toHaveBeenCalledWith('table_name', 'members');
    expect(eqOperationSpy).toHaveBeenCalledWith('operation', 'INSERT');
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
