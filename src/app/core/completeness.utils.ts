import { Member, Group, Company } from '../models';

export interface CompletenessResult {
  score: number;
  missingCoreLabels: string[];
  isComplete: boolean;
}

function calcCompleteness(
  coreChecks: [boolean, string][],
  optionalChecks: boolean[]
): CompletenessResult {
  const missingCoreLabels = coreChecks.filter(([ok]) => !ok).map(([, label]) => label);
  const filled = coreChecks.filter(([ok]) => ok).length + optionalChecks.filter(Boolean).length;
  const total = coreChecks.length + optionalChecks.length;
  return {
    score: Math.round(filled / total * 100),
    missingCoreLabels,
    isComplete: missingCoreLabels.length === 0,
  };
}

export function getMemberCompleteness(m: Member, hasHistory = true): CompletenessResult {
  const hasSocial = !!(m.instagram || m.facebook || m.x);
  return calcCompleteness(
    [
      [!!m.photo_url,  '頭像'],
      [!!m.birthdate,  '生日'],
      [!!m.name_roman, '英文/拼音名'],
      [hasSocial,      '社群帳號'],
      [hasHistory,     '歷程記錄'],
    ],
    [!!m.nickname, !!m.color, !!m.color_name]
  );
}

export function getGroupCompleteness(g: Group, hasMembers = true): CompletenessResult {
  const hasSocial = !!(g.instagram || g.facebook || g.x || g.youtube);
  return calcCompleteness(
    [
      [!!g.photo_url,  '頭像'],
      [!!g.founded_at, '成立日期'],
      [!!g.name_jp,    '日文名稱'],
      [hasSocial,      '社群帳號'],
      [hasMembers,     '成員'],
    ],
    [!!g.style, !!g.disbanded_at]
  );
}

export function getCompanyCompleteness(c: Company, hasGroups = true): CompletenessResult {
  const hasSocial = !!(c.instagram || c.facebook || c.x || c.youtube);
  return calcCompleteness(
    [
      [!!c.photo_url, '頭像'],
      [!!c.website,   '官網'],
      [hasSocial,     '社群帳號'],
      [hasGroups,     '旗下團體'],
    ],
    [!!c.description]
  );
}
