import { convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MembersListComponent } from './members-list.component';
import { Member } from '../../models';

function makeMember(id: string): Member {
  return { id, name: `成員${id}` } as Member;
}

describe('MembersListComponent pagination', () => {
  let component: MembersListComponent;
  let queryParams: BehaviorSubject<ParamMap>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    queryParams = new BehaviorSubject(convertToParamMap({}));
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    const members = Array.from({ length: 80 }, (_, i) => makeMember(String(i)));
    const memberService = { getAll: () => Promise.resolve(members) };
    const groupService = { getAll: () => Promise.resolve([]) };
    const historyService = { getMemberGroupLinks: () => Promise.resolve([]) };
    const seo = jasmine.createSpyObj('SeoService', ['setPage', 'setJsonLdGraph']);
    const route = {
      queryParamMap: queryParams.asObservable(),
      snapshot: { data: {} },
    };

    component = new MembersListComponent(
      memberService as never,
      groupService as never,
      historyService as never,
      seo,
      route as never,
      routerSpy,
    );
  });

  afterEach(() => component.ngOnDestroy());

  it('reads the page from the ?page= query param', async () => {
    queryParams.next(convertToParamMap({ page: '2' }));
    await component.ngOnInit();
    expect(component.currentPage).toBe(2);
  });

  it('falls back to page 1 for a malformed ?page=', async () => {
    queryParams.next(convertToParamMap({ page: 'abc' }));
    await component.ngOnInit();
    expect(component.page).toBe(1);
  });

  it('clamps an out-of-range page to the last page', async () => {
    queryParams.next(convertToParamMap({ page: '99' }));
    await component.ngOnInit();
    // 80 members / 36 per page = 3 pages
    expect(component.totalPages).toBe(3);
    expect(component.page).toBe(3);
    expect(component.pagedMembers.length).toBe(80 - 2 * 36);
  });

  it('setPage() navigates with the page query param', async () => {
    await component.ngOnInit();
    component.setPage(2);
    expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { page: 2 },
    }));
  });

  it('setPage(1) removes the page query param', async () => {
    queryParams.next(convertToParamMap({ page: '2' }));
    await component.ngOnInit();
    component.setPage(1);
    expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { page: null },
    }));
  });
});

describe('MembersListComponent sorting', () => {
  let component: MembersListComponent;
  let queryParams: BehaviorSubject<ParamMap>;

  /** Alphabetical by name_roman: bravo, charlie, delta — reverse of their updated_at order. */
  const members = [
    { id: 'b', name: 'Bravo', name_roman: 'bravo', updated_at: '2026-02-01T00:00:00Z' },
    { id: 'd', name: 'Delta', name_roman: 'delta', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'c', name: 'Charlie', name_roman: 'charlie', updated_at: '2026-03-01T00:00:00Z' },
  ] as Member[];

  beforeEach(() => {
    queryParams = new BehaviorSubject(convertToParamMap({}));
    component = new MembersListComponent(
      { getAll: () => Promise.resolve(members) } as never,
      { getAll: () => Promise.resolve([]) } as never,
      { getMemberGroupLinks: () => Promise.resolve([]) } as never,
      jasmine.createSpyObj('SeoService', ['setPage', 'setJsonLdGraph']),
      { queryParamMap: queryParams.asObservable(), snapshot: { data: {} } } as never,
      jasmine.createSpyObj('Router', ['navigate']),
    );
  });

  afterEach(() => component.ngOnDestroy());

  it('sorts A-Z by roman name when no ?sort= is given', async () => {
    await component.ngOnInit();
    expect(component.sortMode).toBe('name');
    expect(component.filteredMembers.map(m => m.id)).toEqual(['b', 'c', 'd']);
  });

  it('sorts most-recently-updated first for ?sort=recent', async () => {
    queryParams.next(convertToParamMap({ sort: 'recent' }));
    await component.ngOnInit();
    expect(component.sortMode).toBe('recent');
    expect(component.filteredMembers.map(m => m.id)).toEqual(['c', 'b', 'd']);
  });

  it('falls back to name order for an unknown ?sort=', async () => {
    queryParams.next(convertToParamMap({ sort: 'bogus' }));
    await component.ngOnInit();
    expect(component.filteredMembers.map(m => m.id)).toEqual(['b', 'c', 'd']);
  });

  it('re-sorts when ?sort= changes after load', async () => {
    await component.ngOnInit();
    queryParams.next(convertToParamMap({ sort: 'recent' }));
    expect(component.filteredMembers.map(m => m.id)).toEqual(['c', 'b', 'd']);
    queryParams.next(convertToParamMap({}));
    expect(component.filteredMembers.map(m => m.id)).toEqual(['b', 'c', 'd']);
  });

  it('setSort() resets the page and drops the param for name order', async () => {
    await component.ngOnInit();
    const routerSpy = component['router'] as jasmine.SpyObj<Router>;
    component.setSort('recent');
    expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { sort: 'recent', page: null },
    }));

    // The Router spy does not navigate, so emit the param the real navigation would produce.
    queryParams.next(convertToParamMap({ sort: 'recent' }));
    component.setSort('name');
    expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { sort: null, page: null },
    }));
  });
});
