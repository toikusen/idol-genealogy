import { TestBed } from '@angular/core/testing';
import { AdminAuditLogComponent, AutocompleteItem, toUtcRangeStart, toUtcRangeEnd } from './admin-audit-log.component';
import { AuditLogService } from '../../../core/audit-log.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { MemberService } from '../../../core/member.service';
import { GroupService } from '../../../core/group.service';
import { CompanyService } from '../../../core/company.service';
import { AuditLog } from '../../../models';

describe('audit log date utils', () => {
  it('toUtcRangeEnd is exactly 24 hours after toUtcRangeStart for the same date', () => {
    const start = new Date(toUtcRangeStart('2025-05-28')).getTime();
    const end   = new Date(toUtcRangeEnd('2025-05-28')).getTime();
    expect(end - start).toBe(24 * 60 * 60 * 1000);
  });

  it('toUtcRangeStart returns a valid ISO string', () => {
    const result = toUtcRangeStart('2025-05-28');
    expect(() => new Date(result).toISOString()).not.toThrow();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('toUtcRangeEnd is later than toUtcRangeStart', () => {
    const start = new Date(toUtcRangeStart('2025-05-28'));
    const end   = new Date(toUtcRangeEnd('2025-05-28'));
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });
});

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1', table_name: 'members', record_id: 'rec-1',
    operation: 'UPDATE', user_id: null, user_email: 'a@b.com',
    old_data: {}, new_data: {}, created_at: '2026-05-01T12:00:00Z',
    ...overrides,
  };
}

describe('AdminAuditLogComponent — pagination', () => {
  let component: AdminAuditLogComponent;
  let auditLogSpy: jasmine.SpyObj<AuditLogService>;

  beforeEach(async () => {
    auditLogSpy = jasmine.createSpyObj('AuditLogService', ['getAll', 'canRevertLog', 'revert', 'getRecord', 'updateRecord']);
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    await TestBed.configureTestingModule({
      imports: [AdminAuditLogComponent],
      providers: [
        { provide: AuditLogService, useValue: auditLogSpy },
        { provide: AdminRoleService, useValue: jasmine.createSpyObj('AdminRoleService', { getCurrentRole: Promise.resolve(null), getAll: Promise.resolve([]) }) },
        { provide: MemberService, useValue: jasmine.createSpyObj('MemberService', { getAll: Promise.resolve([]), invalidateCache: undefined }) },
        { provide: GroupService, useValue: jasmine.createSpyObj('GroupService', { getAll: Promise.resolve([]), getTeamsByGroup: Promise.resolve([]), invalidateCache: undefined }) },
        { provide: CompanyService, useValue: jasmine.createSpyObj('CompanyService', { getAll: Promise.resolve([]), invalidateCache: undefined }) },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminAuditLogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    auditLogSpy.getAll.calls.reset();
  });

  it('goOlder() pushes currentCursor to stack and sets cursor to last log', async () => {
    component.logs = [
      makeLog({ id: 'first', created_at: '2026-05-01T12:00:00Z' }),
      makeLog({ id: 'last',  created_at: '2026-04-01T00:00:00Z' }),
    ];
    component.currentCursor = null;
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    await component.goOlder();

    expect(component.cursorStack).toEqual([null]);
    expect(component.currentCursor).toEqual(jasmine.objectContaining({
      created_at: '2026-04-01T00:00:00Z',
      id: 'last',
    }));
    expect(auditLogSpy.getAll).toHaveBeenCalled();
  });

  it('goNewer() pops from cursorStack and restores cursor', async () => {
    const prevCursor = { created_at: '2026-03-01T00:00:00Z', id: 'prev' };
    component.cursorStack = [prevCursor];
    component.currentCursor = { created_at: '2026-02-01T00:00:00Z', id: 'current' };
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    await component.goNewer();

    expect(component.currentCursor).toEqual(prevCursor);
    expect(component.cursorStack.length).toBe(0);
    expect(auditLogSpy.getAll).toHaveBeenCalled();
  });

  it('goNewer() restores null cursor when stack had null', async () => {
    component.cursorStack = [null];
    component.currentCursor = { created_at: '2026-02-01T00:00:00Z', id: 'x' };
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    await component.goNewer();

    expect(component.currentCursor).toBeNull();
  });

  it('canGoNewer is false when cursorStack is empty', () => {
    component.cursorStack = [];
    expect(component.canGoNewer).toBeFalse();
  });

  it('canGoNewer is true when cursorStack has items', () => {
    component.cursorStack = [null];
    expect(component.canGoNewer).toBeTrue();
  });

  it('resetPagination() clears cursorStack and sets currentCursor to null', () => {
    component.cursorStack = [{ created_at: '2026-03-01T00:00:00Z', id: 'prev' }];
    component.currentCursor = { created_at: '2026-02-01T00:00:00Z', id: 'x' };

    component.resetPagination();

    expect(component.cursorStack).toEqual([]);
    expect(component.currentCursor).toBeNull();
  });
});
