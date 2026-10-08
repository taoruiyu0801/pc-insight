import type { Snapshot } from "../../../packages/types";
export const categories: Record<string, string> = {
  learning: "学习",
  coding: "编程",
  research: "科研",
  entertainment: "娱乐",
  communication: "沟通",
  system: "系统",
  unknown: "未分类",
};
export const states: Record<string, string> = {
  focused: "专注",
  distracted: "分心",
  interruption: "短暂打断",
  micro: "短切换",
  unknown: "待确认",
  idle: "离开 / 休息",
};
export const colors: Record<string, string> = {
  focused: "#4b806b",
  distracted: "#d78270",
  interruption: "#dfb566",
  micro: "#dfb566",
  unknown: "#a6afbf",
  idle: "#dcdfe5",
  supporting: "#91a9c0",
  background: "#9182b2",
};
export const categoryColors: Record<string, string> = {
  learning: "#55846e",
  coding: "#748eae",
  research: "#9a87b1",
  entertainment: "#d48876",
  communication: "#d1b264",
  system: "#969dac",
  unknown: "#bdc3cf",
};
export function duration(ms: number, precise = false): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (ms <= 0) return precise ? "0 秒" : "0 分钟";
  if (sec < 60) return precise ? `${sec} 秒` : "< 1 分钟";
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
}
export function time(ms: number): string {
  return new Date(ms).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function bounds(date: string): [number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [new Date(y, m - 1, d).getTime(), new Date(y, m - 1, d + 1).getTime()];
}
export function shiftDate(date: string, days: number): string {
  const d = new Date(bounds(date)[0]);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function percent(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}
export function report(
  data: Snapshot,
  date: string,
  kind = "每日",
  demo = false,
): string {
  const s = data.stats;
  const clean = (x: string) => x.replace(/[\r\n|]/g, " ");
  return (
    `# PC Insight · ${kind}回顾\n\n${date}${demo ? " · 演示数据" : ""}\n\n` +
    `- 电脑活动：${duration(s.activeMs)}\n- 目标相关专注：${duration(s.focusMs)}\n- 分心：${duration(s.distractedMs)}\n- 短暂打断：${duration(s.interruptionMs)}\n- 待确认：${duration(s.unknownMs)}\n- 深度工作：${duration(s.deepMs)}\n- 最长连续专注：${duration(s.longestFocusMs)}\n- 上下文切换：${s.switches} 次\n- 自动任务运行（去重）：${duration(s.backgroundMs)}\n- 与人的其他工作并行：${duration(s.parallelMs)}\n\n## 项目投入\n\n` +
    Object.entries(s.projectMs)
      .map(
        ([id, ms]) =>
          `- ${clean(data.projects.find((p) => p.id === id)?.name ?? "未命名项目")}：${duration(ms)}`,
      )
      .join("\n") +
    `\n\n## 观察\n\n${s.activeMs ? `有 ${percent(s.focusMs, s.activeMs)}% 的电脑活动与目标相关。${s.unknownMs > 0 ? "部分活动相关性仍待确认，可以补充项目关键词或规则。" : ""}` : "该日期范围还没有活动记录。"}\n\n` +
    `## 统计口径\n\n主注意力按时间区间去重；辅助窗口不增加工作时长。深度工作为连续相关活动至少 25 分钟。无关活动连续至少 3 分钟才计为分心。后台任务使用显式起止信号。所有数字由本地引擎计算，无 AI 推测。\n`
  );
}
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
