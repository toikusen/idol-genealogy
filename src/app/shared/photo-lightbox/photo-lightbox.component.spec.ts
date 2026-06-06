import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PhotoLightboxComponent } from './photo-lightbox.component';

describe('PhotoLightboxComponent', () => {
  let component: PhotoLightboxComponent;
  let fixture: ComponentFixture<PhotoLightboxComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhotoLightboxComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PhotoLightboxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('close() emits the closed event', () => {
    let emitted = false;
    component.closed.subscribe(() => (emitted = true));

    component.close();

    expect(emitted).toBeTrue();
  });

  it('onEsc() emits closed when open is true', () => {
    component.open = true;
    let emitted = false;
    component.closed.subscribe(() => (emitted = true));

    component.onEsc();

    expect(emitted).toBeTrue();
  });

  it('onEsc() does nothing when open is false', () => {
    component.open = false;
    let emitted = false;
    component.closed.subscribe(() => (emitted = true));

    component.onEsc();

    expect(emitted).toBeFalse();
  });

  it('stopProp() calls stopPropagation on the event', () => {
    const mockEvent = { stopPropagation: jasmine.createSpy('stopPropagation') } as unknown as MouseEvent;

    component.stopProp(mockEvent);

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });
});
