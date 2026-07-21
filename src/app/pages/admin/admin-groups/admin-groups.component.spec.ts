import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { AdminGroupsComponent } from './admin-groups.component';
import { GroupService } from '../../../core/group.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { CompanyService } from '../../../core/company.service';
import { IgPhotoService } from '../../../core/ig-photo.service';
import { ProposalService } from '../../../core/proposal.service';

/**
 * Covers syncYouTubeChannelId only — the path where `youtube` and
 * `youtube_channel_id` can drift apart and make a group page show some other
 * channel's videos. The pure helpers are tested in youtube-feed.utils.spec.ts.
 */
describe('AdminGroupsComponent — YouTube channel sync', () => {
  let component: AdminGroupsComponent;
  let groupService: jasmine.SpyObj<GroupService>;

  const save = () => (component as any).syncYouTubeChannelId() as Promise<boolean>;

  beforeEach(() => {
    groupService = jasmine.createSpyObj<GroupService>('GroupService', [
      'getAll', 'update', 'create', 'resolveYouTubeChannelId',
    ]);
    groupService.getAll.and.resolveTo([]);

    TestBed.configureTestingModule({
      imports: [AdminGroupsComponent],
      providers: [
        { provide: GroupService, useValue: groupService },
        { provide: AdminRoleService, useValue: { isAdmin$: of(true) } },
        { provide: CompanyService, useValue: { getAll: () => Promise.resolve([]) } },
        { provide: IgPhotoService, useValue: {} },
        { provide: ProposalService, useValue: { recordDirectEdit: () => Promise.resolve() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    });

    component = TestBed.createComponent(AdminGroupsComponent).componentInstance;
  });

  it('resolves and stores the ID when a channel is first set', async () => {
    groupService.resolveYouTubeChannelId.and.resolveTo('UCuAXFkgsw1L7xaCfnd5JJOw');
    component.editing = { youtube: '@NewChannel' };
    (component as any).originalData = {};

    expect(await save()).toBe(true);
    expect(component.editing.youtube).toBe('https://www.youtube.com/@NewChannel');
    expect(component.editing.youtube_channel_id).toBe('UCuAXFkgsw1L7xaCfnd5JJOw');
  });

  it('clears the ID when the channel is removed', async () => {
    component.editing = { youtube: '', youtube_channel_id: 'UC_OLD' };
    (component as any).originalData = { youtube: '@Old', youtube_channel_id: 'UC_OLD' };

    expect(await save()).toBe(true);
    expect(component.editing.youtube).toBeNull();
    expect(component.editing.youtube_channel_id).toBeNull();
    expect(groupService.resolveYouTubeChannelId).not.toHaveBeenCalled();
  });

  it('does not call YouTube when the channel is unchanged', async () => {
    component.editing = { name: 'renamed', youtube: '@Same', youtube_channel_id: 'UC_SAME' };
    (component as any).originalData = {
      youtube: 'https://www.youtube.com/@Same', youtube_channel_id: 'UC_SAME',
    };

    expect(await save()).toBe(true);
    expect(groupService.resolveYouTubeChannelId).not.toHaveBeenCalled();
    expect(component.editing.youtube_channel_id).toBe('UC_SAME');
  });

  it('nulls the ID when the new URL is genuinely not a channel', async () => {
    groupService.resolveYouTubeChannelId.and.resolveTo(null);
    component.editing = { youtube: '@NotAChannel', youtube_channel_id: 'UC_OLD' };
    (component as any).originalData = { youtube: '@Old', youtube_channel_id: 'UC_OLD' };

    expect(await save()).toBe(true);
    expect(component.editing.youtube).toBe('https://www.youtube.com/@NotAChannel');
    expect(component.editing.youtube_channel_id).toBeNull();
  });

  // The regression this suite exists for: writing a new channel URL beside the
  // previous channel's ID would show the wrong group's videos.
  it('abandons the save when the channel changed and YouTube is down', async () => {
    groupService.resolveYouTubeChannelId.and.rejectWith(new Error('503'));
    component.editing = { youtube: '@NewChannel', youtube_channel_id: 'UC_OLD' };
    (component as any).originalData = { youtube: '@OldChannel', youtube_channel_id: 'UC_OLD' };

    expect(await save()).toBe(false);
    expect(component.error).toBeTruthy();
  });

  it('still saves when YouTube is down but the channel did not change', async () => {
    groupService.resolveYouTubeChannelId.and.rejectWith(new Error('503'));
    component.editing = { youtube: '@Same', youtube_channel_id: null };
    (component as any).originalData = {
      youtube: 'https://www.youtube.com/@Same', youtube_channel_id: null,
    };

    expect(await save()).toBe(true);
    expect(component.editing.youtube_channel_id).toBeNull();
    expect(component.saveWarning).toBeTruthy();
  });
});
