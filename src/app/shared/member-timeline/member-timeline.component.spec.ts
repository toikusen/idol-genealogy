import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MemberTimelineComponent } from './member-timeline.component';

describe('MemberTimelineComponent add-history card', () => {
  function render(histories: any[]) {
    TestBed.configureTestingModule({
      imports: [MemberTimelineComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(MemberTimelineComponent);
    fixture.componentInstance.histories = histories;
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    return fixture;
  }

  it('offers an add button when the member has no history', () => {
    const fixture = render([]);
    const emitted = jasmine.createSpy('addHistory');
    fixture.componentInstance.addHistory.subscribe(emitted);
    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('[data-testid="add-history"]');
    expect(btn).not.toBeNull();
    btn!.click();
    expect(emitted).toHaveBeenCalled();
  });

  it('shows no add card once the member has history', () => {
    const fixture = render([{
      id: 'h1', member_id: 'm1', group_id: 'g1', status: 'active',
      joined_at: '2024-01-01', left_at: null, group: { id: 'g1', name: 'G', color: '#ff88aa' },
    }]);
    expect(fixture.nativeElement.querySelector('[data-testid="add-history"]')).toBeNull();
  });
});
