import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GroupTreeComponent } from './group-tree.component';
import { History } from '../../models';

function makeHistory(overrides: Partial<History> = {}): History {
  return {
    id: 'h1',
    member_id: 'm1',
    group_id: 'g1',
    team_id: null,
    name_at_time: null,
    role: null,
    status: 'active',
    joined_at: '2020-01-01',
    left_at: null,
    notes: null,
    external_group_name: null,
    external_country: null,
    is_approved: true,
    updated_at: '2020-01-01',
    created_at: '2020-01-01',
    member: { id: 'm1', name: '測試成員' } as History['member'],
    ...overrides,
  };
}

describe('GroupTreeComponent', () => {
  let fixture: ComponentFixture<GroupTreeComponent>;
  let component: GroupTreeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupTreeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupTreeComponent);
    component = fixture.componentInstance;
    component.histories = [makeHistory()];
    component.ngOnChanges();
    fixture.detectChanges();
  });

  it('renders member cards as crawlable <a href="/member/..."> links', () => {
    const anchor = fixture.nativeElement.querySelector('a[href="/member/m1"]');
    expect(anchor).withContext('member card must be a real link for SEO').toBeTruthy();
  });

  it('plain click opens the detail panel instead of navigating', () => {
    const emitted: History[] = [];
    component.selectMember.subscribe(h => emitted.push(h));
    const event = new MouseEvent('click', { cancelable: true });

    component.onCardClick(event, makeHistory());

    expect(event.defaultPrevented).toBeTrue();
    expect(emitted.length).toBe(1);
  });

  it('modified click (cmd/ctrl) keeps native link behavior', () => {
    const emitted: History[] = [];
    component.selectMember.subscribe(h => emitted.push(h));
    const event = new MouseEvent('click', { cancelable: true, metaKey: true });

    component.onCardClick(event, makeHistory());

    expect(event.defaultPrevented).toBeFalse();
    expect(emitted.length).toBe(0);
  });
});
