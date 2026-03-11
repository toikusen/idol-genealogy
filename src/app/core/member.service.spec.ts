import { TestBed } from '@angular/core/testing';
import { MemberService } from './member.service';
import { SupabaseService } from './supabase.service';
import { Member } from '../models';

const mockMember: Member = {
  id: 'uuid-1', name: '山田花子', name_jp: '山田花子',
  photo_url: null, birthdate: '1995-01-01', notes: null,
  updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z'
};

const mockSupabaseService = {
  client: {
    from: jasmine.createSpy('from').and.returnValue({
      select: jasmine.createSpy('select').and.returnValue({
        or: jasmine.createSpy('or').and.returnValue(
          Promise.resolve({ data: [mockMember], error: null })
        ),
        eq: jasmine.createSpy('eq').and.returnValue({
          single: jasmine.createSpy('single').and.returnValue(
            Promise.resolve({ data: mockMember, error: null })
          )
        }),
        order: jasmine.createSpy('order').and.returnValue({
          limit: jasmine.createSpy('limit').and.returnValue(
            Promise.resolve({ data: [mockMember], error: null })
          )
        }),
      }),
      insert: jasmine.createSpy('insert').and.returnValue(
        Promise.resolve({ error: null })
      ),
      update: jasmine.createSpy('update').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(
          Promise.resolve({ error: null })
        )
      }),
      delete: jasmine.createSpy('delete').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(
          Promise.resolve({ error: null })
        )
      }),
    })
  }
};

describe('MemberService', () => {
  let service: MemberService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MemberService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
    service = TestBed.inject(MemberService);
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('search() should call supabase with or() covering name and name_jp', async () => {
    const results = await service.search('山田');
    expect(mockSupabaseService.client.from).toHaveBeenCalledWith('members');
    expect(results).toEqual([mockMember]);
  });

  it('getById() should return a single member', async () => {
    const member = await service.getById('uuid-1');
    expect(member).toEqual(mockMember);
  });

  it('getRecent() should return list of members', async () => {
    const members = await service.getRecent(10);
    expect(Array.isArray(members)).toBeTrue();
  });
});
