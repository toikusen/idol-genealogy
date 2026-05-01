function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function isPlaceholderText(value: string | null | undefined): boolean {
  const text = normalized(value);
  return text === '測試' || text === 'test' || text === 'testing' || text === 'todo' || text === '待補' || text === '暫填';
}

function isTestName(value: string | null | undefined): boolean {
  const text = normalized(value);
  return text === '測試帳號' || text === '測試用的團體' || text === '測試公司' || text === 'test';
}

export function isPublicMemberRecord(member: {
  name?: string | null;
  name_roman?: string | null;
  nickname?: string | null;
}): boolean {
  return ![member.name, member.name_roman, member.nickname].some(isTestName);
}

export function isPublicGroupRecord(group: {
  name?: string | null;
  name_jp?: string | null;
}): boolean {
  return ![group.name, group.name_jp].some(isTestName);
}

export function isPublicCompanyRecord(company: {
  name?: string | null;
}): boolean {
  return !isTestName(company.name);
}

export function sanitizePublicMemberRecord<T extends { notes?: string | null }>(member: T): T {
  return isPlaceholderText(member.notes) ? { ...member, notes: null } : member;
}

export function sanitizePublicGroupRecord<T extends { notes?: string | null }>(group: T): T {
  return isPlaceholderText(group.notes) ? { ...group, notes: null } : group;
}

export function sanitizePublicCompanyRecord<T extends { description?: string | null }>(company: T): T {
  return isPlaceholderText(company.description) ? { ...company, description: null } : company;
}
