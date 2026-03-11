import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SupabaseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should expose a supabase client', () => {
    expect(service.client).toBeTruthy();
  });

  it('should expose authState$ observable', () => {
    expect(service.authState$).toBeTruthy();
  });
});
