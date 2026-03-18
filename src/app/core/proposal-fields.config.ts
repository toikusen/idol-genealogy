// src/app/core/proposal-fields.config.ts

export const PROPOSAL_ALLOWED_FIELDS: Record<string, string[]> = {
  members: [
    'name', 'name_roman', 'nickname', 'birthdate',
    'color', 'color_name', 'instagram', 'facebook', 'x', 'photo_url',
  ],
  groups: [
    'name', 'name_jp', 'color', 'founded_at', 'disbanded_at',
    'instagram', 'facebook', 'x', 'youtube', 'company_id', 'photo_url',
  ],
  history: [
    'member_id', 'name_at_time',
    'status', 'joined_at', 'left_at',
  ],
  companies: [
    'name', 'description', 'website', 'instagram', 'facebook', 'photo_url',
  ],
};

/** Field label map for display in forms and review UI */
export const FIELD_LABELS: Record<string, Record<string, string>> = {
  members: {
    name: '姓名', name_roman: '英文/拼音名', nickname: '暱稱',
    birthdate: '生日', color: '代表色(HEX)', color_name: '代表色名稱',
    instagram: 'Instagram', facebook: 'Facebook', x: 'X (Twitter)',
    photo_url: '頭像圖片',
  },
  groups: {
    name: '組合名稱', name_jp: '日文名稱', color: '代表色(HEX)',
    founded_at: '成立日期', disbanded_at: '解散日期',
    instagram: 'Instagram', facebook: 'Facebook', x: 'X', youtube: 'YouTube',
    company_id: '所屬公司', photo_url: '頭像圖片',
  },
  history: {
    member_id: '成員', name_at_time: '當時藝名', status: '狀態',
    joined_at: '加入日期', left_at: '離開日期',
  },
  companies: {
    name: '公司名稱', description: '簡介', website: '官網',
    instagram: 'Instagram', facebook: 'Facebook', photo_url: '頭像圖片',
  },
};
