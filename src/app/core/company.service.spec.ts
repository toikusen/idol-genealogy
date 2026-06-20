import { TestBed } from '@angular/core/testing';
import { CompanyService } from './company.service';
import { SupabaseService } from './supabase.service';

// A query-builder stub that is both awaitable (resolves to { data, error }) and
// chainable via .eq()/.order(), covering every relational read path we exercise.
function makeQueryResult(): any {
  const result: any = {
    eq: jasmine.createSpy('eq'),
    order: jasmine.createSpy('order'),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  };
  result.eq.and.returnValue(result);
  result.order.and.returnValue(result);
  return result;
}

const mockClient = {
  from: jasmine.createSpy('from').and.callFake(() => ({
    select: jasmine.createSpy('select').and.callFake(() => makeQueryResult()),
    insert: jasmine.createSpy('insert').and.returnValue({
      select: jasmine.createSpy('select').and.returnValue({
        single: jasmine.createSpy('single').and.returnValue(
          Promise.resolve({ data: { id: 'new-c' }, error: null })
        ),
      }),
    }),
    update: jasmine.createSpy('update').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null })),
    }),
    delete: jasmine.createSpy('delete').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null })),
    }),
  })),
};

describe('CompanyService caching', () => {
  let service: CompanyService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CompanyService,
        { provide: SupabaseService, useValue: { client: mockClient } },
      ],
    });
    service = TestBed.inject(CompanyService);
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('getGroupsByCompany() caches per company id', async () => {
    await service.getGroupsByCompany('c-1');
    mockClient.from.calls.reset();
    await service.getGroupsByCompany('c-1');
    expect(mockClient.from).not.toHaveBeenCalled();      // same key → cache hit
    await service.getGroupsByCompany('c-2');
    expect(mockClient.from).toHaveBeenCalledTimes(1);     // new key → re-fetch
  });

  it('getMembersByCompany() serves repeat calls from cache', async () => {
    await service.getMembersByCompany('c-1');
    mockClient.from.calls.reset();
    await service.getMembersByCompany('c-1');
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it('invalidateCache() drops the relational caches', async () => {
    await service.getGroupsByCompany('c-1');
    await service.getMembersByCompany('c-1');
    service.invalidateCache();
    mockClient.from.calls.reset();
    await service.getGroupsByCompany('c-1');
    await service.getMembersByCompany('c-1');
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });
});
