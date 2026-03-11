export interface Member {
  id: string;
  name: string;
  name_jp: string | null;
  photo_url: string | null;
  birthdate: string | null;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  name_jp: string | null;
  color: string;
  founded_at: string | null;
  disbanded_at: string | null;
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
