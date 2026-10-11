export function duration(ms: number, precise = false): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (ms <= 0) return precise ? "0 秒" : "0 分钟";
  if (sec < 60) return precise ? `${sec} 秒` : "< 1 分钟";
  const m = Math.floor(sec / 60);
  if (precise && m < 60 && sec % 60) return `${m} 分 ${sec % 60} 秒`;
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
}

export interface DurationPart {
  value: string;
  unit: string;
}

/** Splits a duration into number/unit pairs so numbers and units can be set at different sizes. */
export function durationParts(ms: number): DurationPart[] {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (ms > 0 && m === 0) return [{ value: "<1", unit: "分钟" }];
  if (m < 60) return [{ value: String(m), unit: "分钟" }];
  return [
    { value: String(Math.floor(m / 60)), unit: "小时" },
    { value: String(m % 60).padStart(2, "0"), unit: "分" },
  ];
}

export function time(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function timeWithSeconds(ms: number): string {
  const d = new Date(ms);
  return `${time(ms)}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function percent(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

/** "12 秒前" / "4 分钟前" for freshness labels. */
export function ago(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 5) return "刚刚";
  if (sec < 60) return `${sec} 秒前`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} 分钟前`;
  return `${Math.floor(m / 60)} 小时前`;
}

export function hoursFraction(ms: number): string {
  return (ms / 3_600_000).toFixed(1);
}
