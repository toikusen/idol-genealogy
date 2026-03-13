export interface Member {
  id: string;
  name: string;
  name_jp: string | null;
  photo_url: string | null;
  color: string | null;
  birthdate: string | null;
  instagram: string | null;
  facebook: string | null;
  x: string | null;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  name_jp: string | null;
  color: string;
  company: string | null;
  founded_at: string | null;
  disbanded_at: string | null;
  notes: string | null;
  style: string | null;
  instagram: string | null;
  facebook: string | null;
  x: string | null;
  youtube: string | null;
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
  group_id: string;
  team_id: string | null;
  name_at_time: string | null;
  role: string | null;
  status: 'active' | 'graduated' | 'transferred' | 'concurrent' | null;
  joined_at: string;
  left_at: string | null;
  notes: string | null;
  is_approved: boolean;
  updated_at: string;
  created_at: string;
  // joined from queries:
  group?: Group;
  team?: Team;
  member?: Member;
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
