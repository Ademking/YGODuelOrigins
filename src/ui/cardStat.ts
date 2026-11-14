export function cardStat(value: number | undefined): string {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? String(value) : '?';
}
