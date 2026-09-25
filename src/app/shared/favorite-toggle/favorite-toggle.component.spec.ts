import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FavoriteToggleComponent } from './favorite-toggle.component';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';
import { PushOptInService } from '../../core/push-opt-in.service';

const mockFavService = {
  isFavorite: jasmine.createSpy('isFavorite').and.returnValue(false),
  isSignedIn: jasmine.createSpy('isSignedIn').and.returnValue(true),
  load: jasmine.createSpy('load').and.returnValue(Promise.resolve()),
  add: jasmine.createSpy('add').and.returnValue(Promise.resolve()),
  remove: jasmine.createSpy('remove').and.returnValue(Promise.resolve()),
};

const mockSupabase = {
  getSessionOnce: jasmine.createSpy('getSessionOnce').and.returnValue(Promise.resolve(null)),
};

describe('FavoriteToggleComponent', () => {
  let fixture: ComponentFixture<FavoriteToggleComponent>;
  let comp: FavoriteToggleComponent;

  beforeEach(async () => {
    mockFavService.isFavorite.and.returnValue(false);
    mockFavService.isSignedIn.and.returnValue(true);
    mockFavService.add.calls.reset();
    mockFavService.remove.calls.reset();
    mockFavService.load.calls.reset();
    mockSupabase.getSessionOnce.and.returnValue(Promise.resolve(null));
    mockSupabase.getSessionOnce.calls.reset();
    await TestBed.configureTestingModule({
      imports: [FavoriteToggleComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavService },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: PushOptInService, useValue: { offer: () => {} } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FavoriteToggleComponent);
    comp = fixture.componentInstance;
    comp.entityType = 'group';
    comp.entityId = 'g-1';
    fixture.detectChanges();
  });

  it('should create', () => expect(comp).toBeTruthy());

  it('shows empty heart when not favorite', () => {
    mockFavService.isFavorite.and.returnValue(false);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button');
    expect(btn.getAttribute('aria-label')).toBe('加入最愛');
  });

  it('calls add when clicked and not favorite', async () => {
    mockFavService.isFavorite.and.returnValue(false);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(mockFavService.add).toHaveBeenCalledWith('group', 'g-1');
  });

  it('calls remove when clicked and already favorite', async () => {
    mockFavService.isFavorite.and.returnValue(true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(mockFavService.remove).toHaveBeenCalledWith('group', 'g-1');
  });

  it('renders for anonymous visitors — the heart is the entry point to the feature', () => {
    mockFavService.isSignedIn.and.returnValue(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeTruthy();
  });

  it('sends an anonymous visitor to login with a return URL instead of silently doing nothing', fakeAsync(() => {
    mockFavService.isSignedIn.and.returnValue(false);
    const navigate = spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button').click();
    tick();

    expect(mockFavService.add).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/' } });
  }));

  it('favourites instead of bouncing when favorites have not loaded yet but a session exists', fakeAsync(() => {
    // The heart is tappable from prerendered HTML, before the lazy FavoritesService
    // has learned who the user is.
    mockFavService.isSignedIn.and.returnValue(false);
    mockSupabase.getSessionOnce.and.returnValue(Promise.resolve({ user: { id: 'u-1' } }));
    const navigate = spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button').click();
    tick();

    expect(navigate).not.toHaveBeenCalled();
    expect(mockFavService.load).toHaveBeenCalledWith('u-1');
    expect(mockFavService.add).toHaveBeenCalledWith('group', 'g-1');
  }));

  it('leaves the button usable after a bounce to login', fakeAsync(() => {
    mockFavService.isSignedIn.and.returnValue(false);
    spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button').click();
    tick();

    expect(comp.loading()).toBeFalse();
  }));
});
