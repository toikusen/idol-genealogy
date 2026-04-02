import { Member, Group, Company } from '../models';

export interface CompletenessResult {
  score: number;
  missingCoreLabels: string[];
  isComplete: boolean;
}

function pct(filled: number, total: number): number {
  return Math.round(filled / total * 100);
}

export function getMemberCompleteness(m: Member): CompletenessResult {
  const hasSocial = !!(m.instagram || m.facebook || m.x);

  const coreChecks: [boolean, string][] = [
    [!!m.photo_url,  '頭像'],
    [!!m.birthdate,  '生日'],
    [!!m.name_roman, '英文/拼音名'],
    [hasSocial,      '社群帳號'],
  ];

  const optionalChecks: boolean[] = [
    !!m.nickname,
    !!m.color,
    !!m.color_name,
  ];

  const missingCoreLabels = coreChecks.filter(([ok]) => !ok).map(([, label]) => label);
  const coreFilledCount = coreChecks.filter(([ok]) => ok).length;
  const optFilledCount = optionalChecks.filter(Boolean).length;
  const total = coreChecks.length + optionalChecks.length;

  return {
    score: pct(coreFilledCount + optFilledCount, total),
    missingCoreLabels,
    isComplete: missingCoreLabels.length === 0,
  };
}

export function getGroupCompleteness(g: Group): CompletenessResult {
  const hasSocial = !!(g.instagram || g.facebook || g.x || g.youtube);

  const coreChecks: [boolean, string][] = [
    [!!g.photo_url,  '頭像'],
    [!!g.founded_at, '成立日期'],
    [!!g.name_jp,    '日文名稱'],
    [hasSocial,      '社群帳號'],
  ];

  const optionalChecks: boolean[] = [
    !!g.style,
    !!g.disbanded_at,
  ];

  const missingCoreLabels = coreChecks.filter(([ok]) => !ok).map(([, label]) => label);
  const coreFilledCount = coreChecks.filter(([ok]) => ok).length;
  const optFilledCount = optionalChecks.filter(Boolean).length;
  const total = coreChecks.length + optionalChecks.length;

  return {
    score: pct(coreFilledCount + optFilledCount, total),
    missingCoreLabels,
    isComplete: missingCoreLabels.length === 0,
  };
}

export function getCompanyCompleteness(c: Company): CompletenessResult {
  const hasSocial = !!(c.instagram || c.facebook || c.x || c.youtube);

  const coreChecks: [boolean, string][] = [
    [!!c.photo_url, '頭像'],
    [!!c.website,   '官網'],
    [hasSocial,     '社群帳號'],
  ];

  const optionalChecks: boolean[] = [
    !!c.description,
  ];

  const missingCoreLabels = coreChecks.filter(([ok]) => !ok).map(([, label]) => label);
  const coreFilledCount = coreChecks.filter(([ok]) => ok).length;
  const optFilledCount = optionalChecks.filter(Boolean).length;
  const total = coreChecks.length + optionalChecks.length;

  return {
    score: pct(coreFilledCount + optFilledCount, total),
    missingCoreLabels,
    isComplete: missingCoreLabels.length === 0,
  };
}
