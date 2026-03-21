import { TestBed } from '@angular/core/testing';
import { ViewCountService } from './view-count.service';
import { SupabaseService } from './supabase.service';

const mockRpc = jasmine.createSpy('rpc').and.returnValue(
  Promise.resolve({ error: null })
);

const mockSupabaseService = {
  client: { rpc: mockRpc }
};

describe('ViewCountService', () => {
  let service: ViewCountService;

  beforeEach(() => {
    mockRpc.calls.reset();
    TestBed.configureTestingModule({
      providers: [
        ViewCountService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
    service = TestBed.inject(ViewCountService);
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('increment() should call supabase rpc with correct args in browser', async () => {
    await service.increment('member', 'uuid-1');
    expect(mockRpc).toHaveBeenCalledWith('increment_view', {
      p_type: 'member',
      p_id: 'uuid-1'
    });
  });

  it('increment() should resolve when rpc returns an error object', async () => {
    mockRpc.and.returnValue(Promise.resolve({ error: { message: 'fail' } }));
    await expectAsync(service.increment('group', 'uuid-2')).toBeResolved();
  });

  it('increment() should resolve even when rpc rejects (network error)', async () => {
    mockRpc.and.returnValue(Promise.reject(new Error('network error')));
    await expectAsync(service.increment('group', 'uuid-3')).toBeRejected();
  });
});
