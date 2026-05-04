export function normalizeHistoryNameAtTime(
  nameAtTime: string | null | undefined,
  currentMemberName: string | null | undefined,
): string | null {
  const normalizedNameAtTime = nameAtTime?.trim() ?? '';
  if (!normalizedNameAtTime) return null;

  const normalizedCurrentName = currentMemberName?.trim() ?? '';
  return normalizedCurrentName && normalizedNameAtTime === normalizedCurrentName
    ? null
    : normalizedNameAtTime;
}
