import { now } from "./clock";

/** Calendar date in local time, `YYYY-MM-DD`. */
export function localDate(date = new Date(now())): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Local day boundaries. The end is the start of the next calendar day, never
 * `start + 86_400_000`, so DST days are 23 or 25 hours long.
 */
export function bounds(date: string): [number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [new Date(y, m - 1, d).getTime(), new Date(y, m - 1, d + 1).getTime()];
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(y, m - 1, d);
  return (
    probe.getFullYear() === y &&
    probe.getMonth() === m - 1 &&
    probe.getDate() === d
  );
}

/** Seven calendar dates ending with (and including) `end`, oldest first. */
export function weekDates(end: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(end, i - 6));
}

/** Range for a list of calendar dates: first day's start to last day's end. */
export function datesBounds(dates: string[]): [number, number] {
  return [bounds(dates[0])[0], bounds(dates[dates.length - 1])[1]];
}

const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function weekday(date: string): string {
  return weekdayNames[new Date(bounds(date)[0]).getDay()];
}

/** `10月8日` */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日`;
}

/** `2026年10月8日 · 周四` */
export function longDate(date: string): string {
  const [y] = date.split("-");
  return `${y}年${shortDate(date)} · ${weekday(date)}`;
}

/** Relationship of a date to today, for headings. */
export function relativeDay(date: string, today = localDate()): string {
  if (date === today) return "今天";
  if (date === shiftDate(today, -1)) return "昨天";
  if (date === shiftDate(today, -2)) return "前天";
  return weekday(date);
}

export function rangeLabel(start: string, end: string): string {
  if (start === end) return longDate(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return sameYear
    ? `${start.slice(0, 4)}年${shortDate(start)} — ${shortDate(end)}`
    : `${start.slice(0, 4)}年${shortDate(start)} — ${end.slice(0, 4)}年${shortDate(end)}`;
}
