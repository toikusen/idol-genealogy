import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SwipeCarouselComponent } from './swipe-carousel.component';

@Component({
  standalone: true,
  imports: [SwipeCarouselComponent],
  template: `
    <app-swipe-carousel label="精選">
      <a class="s0" href="#a" (click)="clicks = clicks + 1; $event.preventDefault()">A</a>
      <a class="s1" href="#b">B</a>
    </app-swipe-carousel>
  `,
})
class HostComponent {
  clicks = 0;
}

describe('SwipeCarouselComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;
  let carousel: SwipeCarouselComponent;

  const pointer = (type: string, x: number, y = 0) =>
    el.querySelector('.sc-viewport')!.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true }));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el = fixture.nativeElement;
    carousel = fixture.debugElement.children[0].componentInstance;
  });

  it('starts on the first slide, with the others inert', () => {
    expect(carousel.index()).toBe(0);
    expect(el.querySelectorAll('.sc-dot').length).toBe(2);
    expect((el.querySelector('.s0') as HTMLElement).inert).toBeFalse();
    expect((el.querySelector('.s1') as HTMLElement).inert).toBeTrue();
  });

  it('wraps around in both directions', () => {
    carousel.go(-1);
    expect(carousel.index()).toBe(1);
    carousel.go(2);
    expect(carousel.index()).toBe(0);
  });

  it('a swipe either way moves to the other slide and does not open the link', () => {
    pointer('pointerdown', 200); pointer('pointermove', 260); pointer('pointerup', 260);
    expect(carousel.index()).toBe(1);
    pointer('pointerdown', 200); pointer('pointermove', 120); pointer('pointerup', 120);
    expect(carousel.index()).toBe(0);
    (el.querySelector('.s0') as HTMLElement).click();
    expect(fixture.componentInstance.clicks).toBe(0);
    (el.querySelector('.s0') as HTMLElement).click();
    expect(fixture.componentInstance.clicks).toBe(1);
  });

  it('ignores short drags and vertical scrolls', () => {
    pointer('pointerdown', 200); pointer('pointermove', 220); pointer('pointerup', 220);
    expect(carousel.index()).toBe(0);
    pointer('pointerdown', 200, 0); pointer('pointermove', 230, 80); pointer('pointerup', 230, 80);
    expect(carousel.index()).toBe(0);
  });

  it('dots switch slides directly', () => {
    (el.querySelectorAll('.sc-dot')[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(carousel.index()).toBe(1);
    expect(el.querySelectorAll('.sc-dot')[1].getAttribute('aria-current')).toBe('true');
  });
});
