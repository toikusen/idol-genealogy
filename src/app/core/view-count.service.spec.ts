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
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        ViewCountService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
    service = TestBed.inject(ViewCountService);
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('increment() should call rpc with type, id, and a session token', async () => {
    await service.increment('member', 'uuid-1');
    expect(mockRpc).toHaveBeenCalledOnceWith('increment_view', {
      p_type: 'member',
      p_id: 'uuid-1',
      p_session_token: jasmine.any(String)
    });
  });

  it('increment() should reuse the same session token across calls', async () => {
    await service.increment('member', 'uuid-1');
    localStorage.removeItem('viewed_member_uuid-1'); // clear cooldown so second call goes through
    await service.increment('group', 'uuid-2');

    const calls = mockRpc.calls.all();
    expect(calls.length).toBe(2);
    const token1 = calls[0].args[1].p_session_token;
    const token2 = calls[1].args[1].p_session_token;
    expect(token1).toBe(token2);
  });

  it('increment() should persist session token in localStorage', async () => {
    await service.increment('member', 'uuid-1');
    const stored = localStorage.getItem('view_session_token');
    expect(stored).toBeTruthy();
    expect(stored).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });

  it('increment() should not call rpc when entity is on cooldown', async () => {
    await service.increment('member', 'uuid-1');
    mockRpc.calls.reset();

    // Second call within cooldown window should be skipped
    await service.increment('member', 'uuid-1');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('increment() should call rpc again after cooldown expires', async () => {
    // Simulate an old timestamp (15 minutes ago)
    localStorage.setItem('viewed_member_uuid-1', String(Date.now() - 15 * 60 * 1000));

    await service.increment('member', 'uuid-1');
    expect(mockRpc).toHaveBeenCalledOnceWith('increment_view', jasmine.objectContaining({
      p_type: 'member',
      p_id: 'uuid-1'
    }));
  });

  it('increment() should mark entity as viewed in localStorage after rpc call', async () => {
    await service.increment('group', 'uuid-2');
    const raw = localStorage.getItem('viewed_group_uuid-2');
    expect(raw).toBeTruthy();
    expect(Number(raw)).toBeCloseTo(Date.now(), -3); // within ~1 second
  });

  it('increment() should resolve when rpc returns an error object', async () => {
    mockRpc.and.returnValue(Promise.resolve({ error: { message: 'fail' } }));
    await expectAsync(service.increment('group', 'uuid-2')).toBeResolved();
  });

  it('increment() should reject when rpc rejects (network error)', async () => {
    mockRpc.and.returnValue(Promise.reject(new Error('network error')));
    await expectAsync(service.increment('group', 'uuid-3')).toBeRejected();
  });
});
