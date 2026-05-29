import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FavoriteToggleComponent } from './favorite-toggle.component';
import { FavoritesService } from '../../core/favorites.service';

const mockFavService = {
  isFavorite: jasmine.createSpy('isFavorite').and.returnValue(false),
  add: jasmine.createSpy('add').and.returnValue(Promise.resolve()),
  remove: jasmine.createSpy('remove').and.returnValue(Promise.resolve()),
};

describe('FavoriteToggleComponent', () => {
  let fixture: ComponentFixture<FavoriteToggleComponent>;
  let comp: FavoriteToggleComponent;

  beforeEach(async () => {
    mockFavService.isFavorite.and.returnValue(false);
    mockFavService.add.calls.reset();
    mockFavService.remove.calls.reset();
    await TestBed.configureTestingModule({
      imports: [FavoriteToggleComponent],
      providers: [{ provide: FavoritesService, useValue: mockFavService }],
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
});
