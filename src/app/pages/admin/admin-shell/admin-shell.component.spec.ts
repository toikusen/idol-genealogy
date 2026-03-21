// src/app/pages/admin/admin-shell/admin-shell.component.spec.ts
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { AdminShellComponent } from './admin-shell.component';
import { provideRouter } from '@angular/router';
import { AdminRoleService } from '../../../core/admin-role.service';
import { ProposalService } from '../../../core/proposal.service';
import { SupabaseService } from '../../../core/supabase.service';
import { BehaviorSubject } from 'rxjs';

describe('AdminShellComponent drawer', () => {
  let component: AdminShellComponent;
  let fixture: ComponentFixture<AdminShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [
        provideRouter([]),
        { provide: AdminRoleService, useValue: { isAdmin$: new BehaviorSubject(false) } },
        { provide: ProposalService, useValue: { getPendingCount: () => Promise.resolve(0) } },
        { provide: SupabaseService, useValue: { signOut: () => Promise.resolve() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminShellComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    document.body.classList.remove('overflow-hidden');
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

  it('toggleDrawer adds overflow-hidden to body when opening', () => {
    component.toggleDrawer();
    expect(document.body.classList.contains('overflow-hidden')).toBeTrue();
  });

  it('toggleDrawer removes overflow-hidden from body when closing', () => {
    component.drawerOpen = true;
    document.body.classList.add('overflow-hidden');
    component.toggleDrawer();
    expect(document.body.classList.contains('overflow-hidden')).toBeFalse();
  });

  it('closeDrawer removes overflow-hidden from body', () => {
    document.body.classList.add('overflow-hidden');
    component.closeDrawer();
    expect(document.body.classList.contains('overflow-hidden')).toBeFalse();
  });
});
