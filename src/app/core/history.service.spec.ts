import { TestBed } from '@angular/core/testing';
import { HistoryService } from './history.service';
import { SupabaseService } from './supabase.service';
import { History } from '../models';

const mockHistory: History = {
  id: 'h-1', member_id: 'm-1', group_id: 'g-1', team_id: null,
  role: '正式成員', status: 'graduated',
  joined_at: '2013-04-01', left_at: '2019-03-01',
  notes: null, is_approved: true,
  updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z'
};

const mockClient = {
  from: jasmine.createSpy('from').and.returnValue({
    select: jasmine.createSpy('select').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue({
        order: jasmine.createSpy('order').and.returnValue(
          Promise.resolve({ data: [mockHistory], error: null })
        )
      }),
      order: jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [mockHistory], error: null })
      ),
    }),
    insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null })),
    update: jasmine.createSpy('update').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
    }),
    delete: jasmine.createSpy('delete').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
    }),
  })
};

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HistoryService,
        { provide: SupabaseService, useValue: { client: mockClient } }
      ]
    });
    service = TestBed.inject(HistoryService);
  });

  it('should be created', () => expect(service).toBeTruthy());
  it('getByMember() should return records', async () => {
    const records = await service.getByMember('m-1');
    expect(Array.isArray(records)).toBeTrue();
    expect(records[0]).toEqual(mockHistory);
  });
  it('getByGroup() should return records', async () => {
    const records = await service.getByGroup('g-1');
    expect(Array.isArray(records)).toBeTrue();
  });
});
