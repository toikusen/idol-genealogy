import { TestBed } from '@angular/core/testing';
import { AuditLogService } from './audit-log.service';
import { SupabaseService } from './supabase.service';
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
    ...overrides
  };
}

describe('AuditLogService', () => {
  let service: AuditLogService;
  let dbSpy: jasmine.SpyObj<any>;

  beforeEach(() => {
    dbSpy = { from: jasmine.createSpy('from') };

    TestBed.configureTestingModule({
      providers: [
        AuditLogService,
        { provide: SupabaseService, useValue: { client: dbSpy } }
      ]
    });
    service = TestBed.inject(AuditLogService);
  });

  it('getAll() returns audit log entries ordered by created_at desc', async () => {
    const logs = [makeLog()];
    const chain = {
      select: jasmine.createSpy().and.returnValue({
        order: jasmine.createSpy().and.returnValue({
          limit: jasmine.createSpy().and.returnValue(Promise.resolve({ data: logs, error: null }))
        })
      })
    };
    dbSpy.from.and.returnValue(chain);
    const result = await service.getAll();
    expect(result).toEqual(logs);
  });

  it('getAll() applies table_name filter when provided', async () => {
    const eqSpy = jasmine.createSpy('eq').and.returnValue({
      order: jasmine.createSpy().and.returnValue({
        limit: jasmine.createSpy().and.returnValue(Promise.resolve({ data: [], error: null }))
      })
    });
    const chain = {
      select: jasmine.createSpy().and.returnValue({ eq: eqSpy })
    };
    dbSpy.from.and.returnValue(chain);
    await service.getAll({ table_name: 'members' });
    expect(eqSpy).toHaveBeenCalledWith('table_name', 'members');
  });

  it('revert() calls update with old_data for UPDATE operation', async () => {
    const log = makeLog({ operation: 'UPDATE', old_data: { name: 'Old' }, record_id: 'rec-1' });
    const eqSpy = jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }));
    const updateChain = { eq: eqSpy };
    const chain = {
      update: jasmine.createSpy().and.returnValue(updateChain),
      delete: jasmine.createSpy(),
      insert: jasmine.createSpy(),
    };
    dbSpy.from.and.returnValue(chain);
    await service.revert(log);
    expect(chain.update).toHaveBeenCalledWith(log.old_data);
    expect(eqSpy).toHaveBeenCalledWith('id', 'rec-1');
  });

  it('revert() calls delete for INSERT operation', async () => {
    const log = makeLog({ operation: 'INSERT', record_id: 'rec-2' });
    const eqSpy = jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }));
    const chain = {
      delete: jasmine.createSpy().and.returnValue({ eq: eqSpy }),
      update: jasmine.createSpy(),
      insert: jasmine.createSpy(),
    };
    dbSpy.from.and.returnValue(chain);
    await service.revert(log);
    expect(chain.delete).toHaveBeenCalled();
    expect(eqSpy).toHaveBeenCalledWith('id', 'rec-2');
  });

  it('revert() calls insert with old_data for DELETE operation', async () => {
    const log = makeLog({ operation: 'DELETE', old_data: { id: 'rec-3', name: 'Gone' } });
    const chain = {
      insert: jasmine.createSpy().and.returnValue(Promise.resolve({ error: null })),
      delete: jasmine.createSpy(),
      update: jasmine.createSpy(),
    };
    dbSpy.from.and.returnValue(chain);
    await service.revert(log);
    expect(chain.insert).toHaveBeenCalledWith(log.old_data);
  });

  it('revert() throws when Supabase returns an error', async () => {
    const log = makeLog({ operation: 'UPDATE' });
    const eqSpy = jasmine.createSpy('eq').and.returnValue(
      Promise.resolve({ error: { message: 'FK violation' } })
    );
    const chain = {
      update: jasmine.createSpy().and.returnValue({ eq: eqSpy }),
      delete: jasmine.createSpy(),
      insert: jasmine.createSpy(),
    };
    dbSpy.from.and.returnValue(chain);
    await expectAsync(service.revert(log)).toBeRejectedWithError('FK violation');
  });

  it('getAll() applies operation filter when provided', async () => {
    const eqSpy = jasmine.createSpy('eq').and.returnValue({
      order: jasmine.createSpy().and.returnValue({
        limit: jasmine.createSpy().and.returnValue(Promise.resolve({ data: [], error: null }))
      })
    });
    const chain = {
      select: jasmine.createSpy().and.returnValue({ eq: eqSpy })
    };
    dbSpy.from.and.returnValue(chain);
    await service.getAll({ operation: 'INSERT' });
    expect(eqSpy).toHaveBeenCalledWith('operation', 'INSERT');
  });

  it('getAll() applies both table_name and operation filters when both provided', async () => {
    const eqOperationSpy = jasmine.createSpy('eqOperation').and.returnValue({
      order: jasmine.createSpy().and.returnValue({
        limit: jasmine.createSpy().and.returnValue(Promise.resolve({ data: [], error: null }))
      })
    });
    const eqTableSpy = jasmine.createSpy('eqTable').and.returnValue({ eq: eqOperationSpy });
    const chain = {
      select: jasmine.createSpy().and.returnValue({ eq: eqTableSpy })
    };
    dbSpy.from.and.returnValue(chain);
    await service.getAll({ table_name: 'members', operation: 'UPDATE' });
    expect(eqTableSpy).toHaveBeenCalledWith('table_name', 'members');
    expect(eqOperationSpy).toHaveBeenCalledWith('operation', 'UPDATE');
  });
});
