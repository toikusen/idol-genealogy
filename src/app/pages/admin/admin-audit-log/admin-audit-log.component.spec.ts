import { TestBed } from '@angular/core/testing';
import { AdminAuditLogComponent, AutocompleteItem, toUtcRangeStart, toUtcRangeEnd } from './admin-audit-log.component';
import { AuditLogService } from '../../../core/audit-log.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { MemberService } from '../../../core/member.service';
import { GroupService } from '../../../core/group.service';
import { CompanyService } from '../../../core/company.service';
import { AuditLog, Member, Group } from '../../../models';

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
  let fixture: any;
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

    fixture = TestBed.createComponent(AdminAuditLogComponent);
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

  it('renders 較舊 button when hasMore=true even if displayLogs is empty', async () => {
    component.logs = [];
    component.hasMore = true;
    component.loading = false;
    fixture.detectChanges();
    await fixture.whenStable();

    const allButtons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const olderBtn = allButtons.find((b: HTMLButtonElement) => b.textContent?.includes('較舊'));
    expect(olderBtn).toBeTruthy();
    expect(olderBtn?.disabled).toBeFalse();
  });
});

describe('AdminAuditLogComponent — autocomplete', () => {
  let component: AdminAuditLogComponent;
  let auditLogSpy: jasmine.SpyObj<AuditLogService>;

  const mockMembers: Member[] = [
    { id: 'm1', name: '木村咲子', name_roman: null, name_hiragana: null, emoji: null, photo_url: null, color: null, color_name: null, birthdate: null, nickname: null, instagram: null, facebook: null, x: null, maid_url: null, notes: null, company_id: null, no_sns: false, photo_status: null, photo_notes: null, video_status: null, video_notes: null, photography_source: null, updated_at: '', created_at: '' },
    { id: 'm2', name: '山田花子', name_roman: 'Hanako', name_hiragana: null, emoji: null, photo_url: null, color: null, color_name: null, birthdate: null, nickname: null, instagram: null, facebook: null, x: null, maid_url: null, notes: null, company_id: null, no_sns: false, photo_status: null, photo_notes: null, video_status: null, video_notes: null, photography_source: null, updated_at: '', created_at: '' },
  ];
  const mockGroups: Group[] = [
    { id: 'g1', name: 'AKB48', name_jp: null, photo_url: null, color: '#fff', company: null, company_id: null, founded_at: null, disbanded_at: null, disbanded_announced_at: null, notes: null, is_trainee: false, instagram: null, facebook: null, x: null, youtube: null, youtube_channel_id: null, timetree_url: null, photo_status: null, photo_notes: null, video_status: null, video_notes: null, photography_source: null, updated_at: '', created_at: '' },
  ];

  beforeEach(async () => {
    auditLogSpy = jasmine.createSpyObj('AuditLogService', ['getAll', 'canRevertLog', 'revert', 'getRecord', 'updateRecord']);
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    const memberSpy = jasmine.createSpyObj('MemberService', { getAll: Promise.resolve(mockMembers), invalidateCache: undefined });
    const groupSpy  = jasmine.createSpyObj('GroupService',  { getAll: Promise.resolve(mockGroups), getTeamsByGroup: Promise.resolve([]), invalidateCache: undefined });

    await TestBed.configureTestingModule({
      imports: [AdminAuditLogComponent],
      providers: [
        { provide: AuditLogService, useValue: auditLogSpy },
        { provide: AdminRoleService, useValue: jasmine.createSpyObj('AdminRoleService', { getCurrentRole: Promise.resolve(null), getAll: Promise.resolve([]) }) },
        { provide: MemberService,  useValue: memberSpy },
        { provide: GroupService,   useValue: groupSpy },
        { provide: CompanyService, useValue: jasmine.createSpyObj('CompanyService', { getAll: Promise.resolve([]), invalidateCache: undefined }) },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminAuditLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    auditLogSpy.getAll.calls.reset();
  });

  it('computeAutocompleteResults filters members by name', () => {
    component.autocompleteQuery = '木村';
    const results = component.computeAutocompleteResults();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('m1');
    expect(results[0].type).toBe('member');
  });

  it('computeAutocompleteResults filters members by name_roman', () => {
    component.autocompleteQuery = 'Hana';
    const results = component.computeAutocompleteResults();
    const memberResult = results.find(r => r.type === 'member');
    expect(memberResult?.id).toBe('m2');
  });

  it('computeAutocompleteResults includes groups', () => {
    component.autocompleteQuery = 'AKB';
    const results = component.computeAutocompleteResults();
    expect(results.length).toBe(1);
    expect(results[0].type).toBe('group');
  });

  it('computeAutocompleteResults returns empty for blank query', () => {
    component.autocompleteQuery = '';
    expect(component.computeAutocompleteResults()).toEqual([]);
  });

  it('selectAutocomplete sets selectedMemberId and resets pagination', async () => {
    const item: AutocompleteItem = { type: 'member', id: 'm1', name: '木村咲子' };
    await component.selectAutocomplete(item);
    expect(component.selectedMemberId).toBe('m1');
    expect(component.selectedGroupId).toBeNull();
    expect(component.cursorStack.length).toBe(0);
    expect(component.currentCursor).toBeNull();
  });

  it('selectAutocomplete sets selectedGroupId and clears selectedMemberId', async () => {
    component.selectedMemberId = 'm1';
    const item: AutocompleteItem = { type: 'group', id: 'g1', name: 'AKB48' };
    await component.selectAutocomplete(item);
    expect(component.selectedGroupId).toBe('g1');
    expect(component.selectedMemberId).toBeNull();
  });

  it('clearAutocomplete resets selection and reloads', async () => {
    component.selectedMemberId = 'm1';
    component.autocompleteQuery = '木村';
    await component.clearAutocomplete();
    expect(component.selectedMemberId).toBeNull();
    expect(component.selectedGroupId).toBeNull();
    expect(component.autocompleteQuery).toBe('');
    expect(auditLogSpy.getAll).toHaveBeenCalled();
  });

  it('computeAutocompleteResults prefers group name over name_jp as display name', () => {
    component.groups = [
      { id: 'g2', name: 'AKB48', name_jp: 'エイケービー48', photo_url: null } as any,
    ];
    component.autocompleteQuery = 'AKB';
    const results = component.computeAutocompleteResults();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('AKB48');
  });

  it('onFilterChange() resets pagination and calls load()', async () => {
    component.cursorStack = [{ created_at: '2026-01-01T00:00:00Z', id: 'c1' }];
    component.currentCursor = { created_at: '2026-01-01T00:00:00Z', id: 'c2' };

    await component.onFilterChange();

    expect(component.cursorStack).toEqual([]);
    expect(component.currentCursor).toBeNull();
    expect(auditLogSpy.getAll).toHaveBeenCalled();
  });

  it('clearDateFilter() clears dateFrom and dateTo, resets pagination, and calls load()', async () => {
    component.dateFrom = '2025-01-01';
    component.dateTo = '2025-12-31';
    component.cursorStack = [null];

    await component.clearDateFilter();

    expect(component.dateFrom).toBe('');
    expect(component.dateTo).toBe('');
    expect(component.cursorStack).toEqual([]);
    expect(auditLogSpy.getAll).toHaveBeenCalled();
  });
});
