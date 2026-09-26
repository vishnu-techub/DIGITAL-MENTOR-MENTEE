/**
 * Date utility helpers for KSRCE Saturday meeting calendar
 */

export function getUpcomingSaturday(fromDate: Date = new Date()): string {
  const d = new Date(fromDate);
  const day = d.getDay(); // 0 is Sunday, 6 is Saturday
  const diff = (6 - day + 7) % 7; // days until next Saturday
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

export function getPreviousSaturday(fromDate: Date = new Date()): string {
  const d = new Date(fromDate);
  const day = d.getDay();
  const diff = (day + 1) % 7; // days back to last Saturday
  d.setDate(d.getDate() - diff);
  return d.toISOString().split('T')[0];
}

export function isSaturday(dateStr: string): boolean {
  const d = new Date(dateStr);
  return d.getDay() === 6;
}
