export interface Member {
  id: string;
  name: string;
  name_hiragana: string | null;
  name_roman: string | null;
  emoji: string | null;
  photo_url: string | null;
  color: string | null;
  color_name: string | null;
  birthdate: string | null;
  nickname: string | null;
  instagram: string | null;
  facebook: string | null;
  x: string | null;
  maid_url: string | null;
  notes: string | null;
  company_id: string | null;
  no_sns: boolean;
  updated_at: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  name_jp: string | null;
  photo_url: string | null;
  color: string;
  company: string | null;
  company_id: string | null;
  founded_at: string | null;
  disbanded_at: string | null;
  disbanded_announced_at: string | null;
  notes: string | null;
  is_trainee: boolean;
  style: string | null;
  instagram: string | null;
  facebook: string | null;
  x: string | null;
  youtube: string | null;
  timetree_url: string | null;
  updated_at: string;
  created_at: string;
}

export interface Team {
  id: string;
  group_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface History {
  id: string;
  member_id: string;
  group_id: string | null;
  team_id: string | null;
  name_at_time: string | null;
  role: string | null;
  status: 'active' | 'graduated' | 'transferred' | 'concurrent' | 'support' | 'hiatus' | 'withdrawn' | null;
  joined_at: string;
  left_at: string | null;
  notes: string | null;
  external_group_name: string | null;
  external_country: string | null;
  is_approved: boolean;
  updated_at: string;
  created_at: string;
  // joined from queries:
  group?: Group;
  team?: Team;
  member?: Member;
}

export interface GroupVideo {
  id: string;
  group_id: string;
  url: string;
  title: string | null;
  sort_order: number;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  color: string | null;
  instagram: string | null;
  facebook: string | null;
  x: string | null;
  youtube: string | null;
  website: string | null;
  founded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  instagram: string | null;
  x: string | null;
  user_id: string | null;
  user_role_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  members: Member[];
  groups: Group[];
}

export interface UserRole {
  id: string;
  email: string;
  role: 'superadmin' | 'admin' | 'editor';
  display_name: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  user_id: string | null;
  user_email: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
}

export interface Proposal {
  id: string;
  table_name: 'members' | 'groups' | 'history' | 'companies' | 'group_songs' | 'member_songs' | 'venues';
  record_id: string | null;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  proposed_data: Record<string, any>;
  original_data: Record<string, any> | null;
  reviewed_data: Record<string, any> | null;
  submitter_id: string | null;
  submitter_name: string;
  submitter_email: string | null;
  submitter_note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface MemberLeaderboardEntry {
  id: string;
  name: string;
  name_roman: string | null;
  photo_url: string | null;
  color: string | null;
  view_count: number;
}

export interface GroupLeaderboardEntry {
  id: string;
  name: string;
  photo_url: string | null;
  color: string | null;
  view_count: number;
}

export interface MemberSong {
  id: string;
  member_id: string;
  title: string;
  release_date: string | null;
  youtube_url: string | null;
  composer: string | null;
  lyricist: string | null;
  arranger: string | null;
  notes: string | null;
  sort_order: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface GroupSong {
  id: string;
  group_id: string;
  title: string;
  release_date: string | null;
  youtube_url: string | null;
  composer: string | null;
  lyricist: string | null;
  arranger: string | null;
  notes: string | null;
  sort_order: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export type VenueRegionFilter = 'all' | 'north' | 'central' | 'south';

export interface Venue {
  id: string;
  name: string;
  address: string;
  type: string | null;
  region: 'north' | 'central' | 'south';
  google_maps_url: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface VenueCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  location: string | null;
  url: string | null;
  isAllDay: boolean;
}

export type FavoriteEntityType = 'group' | 'member';

export interface UserFavorite {
  user_id: string;
  entity_type: FavoriteEntityType;
  entity_id: string;
  created_at: string;
}

export interface FeedItem {
  id: string;
  entity_type: FavoriteEntityType;
  entity_id: string;
  entity_name: string;
  event_type: 'event' | 'song' | 'member_change';
  title: string;
  occurred_at: string;
  url?: string;
}

export interface NotificationPrefs {
  notify_event: boolean;
  notify_new_song: boolean;
  notify_status: boolean;
  notify_birthday: boolean;
  notify_disbanded: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notify_event: true,
  notify_new_song: true,
  notify_status: true,
  notify_birthday: true,
  notify_disbanded: true,
};
