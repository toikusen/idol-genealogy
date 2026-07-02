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
