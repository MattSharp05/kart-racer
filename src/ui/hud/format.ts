const ORDINAL = ['th', 'st', 'nd', 'rd'];

export function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${ORDINAL[(v - 20) % 10] ?? ORDINAL[v] ?? ORDINAL[0]}`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
