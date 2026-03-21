import { TestBed } from '@angular/core/testing';
import { AdminShellComponent } from './admin-shell.component';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminRoleService } from '../../../core/admin-role.service';
import { ProposalService } from '../../../core/proposal.service';
import { SupabaseService } from '../../../core/supabase.service';
import { BehaviorSubject } from 'rxjs';

describe('AdminShellComponent drawer', () => {
  let component: AdminShellComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent, RouterTestingModule],
      providers: [
        { provide: AdminRoleService, useValue: { isAdmin$: new BehaviorSubject(false) } },
        { provide: ProposalService, useValue: { getPendingCount: () => Promise.resolve(0) } },
        { provide: SupabaseService, useValue: { signOut: () => Promise.resolve() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminShellComponent);
    component = fixture.componentInstance;
  });

  it('starts with drawerOpen false', () => {
    expect(component.drawerOpen).toBeFalse();
  });

  it('toggleDrawer opens the drawer', () => {
    component.toggleDrawer();
    expect(component.drawerOpen).toBeTrue();
  });

  it('toggleDrawer closes an open drawer', () => {
    component.drawerOpen = true;
    component.toggleDrawer();
    expect(component.drawerOpen).toBeFalse();
  });

  it('closeDrawer sets drawerOpen to false', () => {
    component.drawerOpen = true;
    component.closeDrawer();
    expect(component.drawerOpen).toBeFalse();
  });
});
