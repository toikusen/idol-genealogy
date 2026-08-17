// src/app/core/proposal-fields.config.ts

export const PROPOSAL_ALLOWED_FIELDS: Record<string, string[]> = {
  members: [
    'name', 'name_hiragana', 'name_roman', 'emoji', 'nickname', 'birthdate',
    'color', 'color_name', 'instagram', 'facebook', 'x', 'maid_url', 'photo_url',
    'photo_status', 'photo_notes', 'video_status', 'video_notes', 'photography_source',
  ],
  groups: [
    'name', 'name_jp', 'color', 'founded_at', 'disbanded_at',
    'instagram', 'facebook', 'x', 'youtube', 'timetree_url', 'company_id', 'photo_url',
    'photo_status', 'photo_notes', 'video_status', 'video_notes', 'photography_source',
  ],
  history: [
    'member_id', 'group_id', 'name_at_time',
    'status', 'joined_at', 'left_at',
    'external_group_name', 'external_country',
    'role', 'notes',
  ],
  member_songs: [
    'title', 'release_date', 'youtube_url', 'composer', 'lyricist', 'arranger', 'choreographer', 'notes',
  ],
  group_songs: [
    'title', 'release_date', 'youtube_url', 'composer', 'lyricist', 'arranger', 'choreographer', 'notes',
  ],
  companies: [
    'name', 'description', 'founded_at', 'website', 'instagram', 'facebook', 'x', 'youtube', 'photo_url',
  ],
  venues: [
    'name', 'address', 'type', 'region', 'google_maps_url', 'phone', 'notes',
  ],
};

/** Field label map for display in forms and review UI */
export const FIELD_LABELS: Record<string, Record<string, string>> = {
  members: {
    name: '姓名', name_hiragana: '日文平假名', name_roman: '英文/拼音名', emoji: '表情符號', nickname: '暱稱',
    birthdate: '生日', color: '代表色(HEX)', color_name: '代表色名稱',
    instagram: 'Instagram', facebook: 'Facebook', x: 'X (Twitter)',
    maid_url: '女僕帳號', photo_url: '頭像圖片',
    photo_status: '攝影規範', photo_notes: '攝影備註', video_status: '錄影規範', video_notes: '錄影備註', photography_source: '資料來源',
  },
  groups: {
    name: '團體名稱', name_jp: '日文名稱', color: '代表色(HEX)',
    founded_at: '成立日期', disbanded_at: '解散日期',
    instagram: 'Instagram', facebook: 'Facebook', x: 'X', youtube: 'YouTube', timetree_url: 'TimeTree',
    company_id: '所屬公司', photo_url: '頭像圖片',
    photo_status: '攝影規範', photo_notes: '攝影備註', video_status: '錄影規範', video_notes: '錄影備註', photography_source: '資料來源',
  },
  history: {
    member_id: '成員', group_id: '團體', name_at_time: '當時名稱', status: '狀態',
    joined_at: '加入日期', left_at: '離開日期',
    external_group_name: '海外團體/solo名稱', external_country: '國家／地區（非必填）',
    role: '職稱', notes: '備注',
  },
  companies: {
    name: '公司名稱', description: '簡介', founded_at: '成立日期', website: '官網',
    instagram: 'Instagram', facebook: 'Facebook', x: 'X (Twitter)', youtube: 'YouTube', photo_url: '頭像圖片',
  },
  member_songs: {
    title: '歌曲名稱', release_date: '發行日期', youtube_url: 'YouTube 連結',
    composer: '作曲', lyricist: '作詞', arranger: '編曲', choreographer: '編舞', notes: '備注',
  },
  group_songs: {
    title: '歌曲名稱', release_date: '發行日期', youtube_url: 'YouTube 連結',
    composer: '作曲', lyricist: '作詞', arranger: '編曲', choreographer: '編舞', notes: '備注',
  },
  venues: {
    name: '場地名稱', address: '地址', type: '類型', region: '區域',
    google_maps_url: 'Google Maps 連結', phone: '電話', notes: '備注',
  },
};
