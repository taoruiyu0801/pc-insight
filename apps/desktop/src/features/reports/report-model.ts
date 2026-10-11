import type { Project, Snapshot, Stats } from "../../../../../packages/types";
import { bounds, rangeLabel, shortDate, weekday } from "../../lib/dates";
import { duration, percent } from "../../lib/format";
import { categoryLabel } from "../../lib/semantics";

/**
 * One report model drives both the on-screen preview and the Markdown export,
 * so the two can never disagree about range or definitions.
 *
 * Weekly totals are built from seven *daily* snapshots, matching the product
 * promise (README) that deep work is judged per calendar day:
 * - additive time fields (active, focus, deep, …) are summed; days are disjoint.
 * - background / parallel are per-day unions; summing disjoint days equals the
 *   union over the week, so nothing is counted twice.
 * - longest focus is the maximum of the days, never a sum.
 * - fragmentation is recomputed from per-day unrelated-span counts.
 */
export interface ReportTotals {
  activeMs: number;
  focusMs: number;
  distractedMs: number;
  interruptionMs: number;
  unknownMs: number;
  idleMs: number;
  deepMs: number;
  longestFocusMs: number;
  backgroundMs: number;
  parallelMs: number;
  switches: number;
  distractionCount: number;
  /** Unrelated spans per active hour, from the per-day counts. */
  fragmentation: number;
}

export interface ReportDay {
  date: string;
  totals: ReportTotals;
}

export interface ReportModel {
  kind: "day" | "week";
  startDate: string;
  endDate: string;
  /** Exact millisecond range covered: first day start to last day end. */
  start: number;
  end: number;
  rangeLabel: string;
  demo: boolean;
  totals: ReportTotals;
  days: ReportDay[];
  projects: { id: string; name: string; ms: number }[];
  categories: { key: string; label: string; ms: number }[];
  observations: string[];
}

const additive = [
  "activeMs",
  "focusMs",
  "distractedMs",
  "interruptionMs",
  "unknownMs",
  "idleMs",
  "deepMs",
  "backgroundMs",
  "parallelMs",
  "switches",
  "distractionCount",
] as const;

export function totalsOf(stats: Stats): ReportTotals {
  return {
    activeMs: stats.activeMs,
    focusMs: stats.focusMs,
    distractedMs: stats.distractedMs,
    interruptionMs: stats.interruptionMs,
    unknownMs: stats.unknownMs,
    idleMs: stats.idleMs,
    deepMs: stats.deepMs,
    longestFocusMs: stats.longestFocusMs,
    backgroundMs: stats.backgroundMs,
    parallelMs: stats.parallelMs,
    switches: stats.switches,
    distractionCount: stats.distractionCount,
    fragmentation: stats.fragmentation,
  };
}

export function aggregateStats(list: Stats[]): ReportTotals {
  const t: ReportTotals = {
    activeMs: 0,
    focusMs: 0,
    distractedMs: 0,
    interruptionMs: 0,
    unknownMs: 0,
    idleMs: 0,
    deepMs: 0,
    longestFocusMs: 0,
    backgroundMs: 0,
    parallelMs: 0,
    switches: 0,
    distractionCount: 0,
    fragmentation: 0,
  };
  let unrelatedSpans = 0;
  for (const s of list) {
    for (const key of additive) t[key] += s[key];
    t.longestFocusMs = Math.max(t.longestFocusMs, s.longestFocusMs);
    unrelatedSpans += s.fragmentation * (s.activeMs / 3_600_000);
  }
  t.fragmentation = t.activeMs
    ? Math.round(unrelatedSpans) / (t.activeMs / 3_600_000)
    : 0;
  return t;
}

function sumRecords(list: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of list)
    for (const [k, v] of Object.entries(r)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export interface DayInput {
  date: string;
  snapshot: Snapshot;
}

export function buildReport(
  kind: "day" | "week",
  days: DayInput[],
  demo: boolean,
  projects: Project[] = days[days.length - 1]?.snapshot.projects ?? [],
): ReportModel {
  if (!days.length) throw new Error("报告至少需要一天的数据");
  const stats = days.map((d) => d.snapshot.stats);
  const totals = aggregateStats(stats);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const projectMs = sumRecords(stats.map((s) => s.projectMs));
  const categoryMs = sumRecords(stats.map((s) => s.categoryMs));
  const startDate = days[0].date;
  const endDate = days[days.length - 1].date;
  const model: ReportModel = {
    kind,
    startDate,
    endDate,
    start: bounds(startDate)[0],
    end: bounds(endDate)[1],
    rangeLabel: rangeLabel(startDate, endDate),
    demo,
    totals,
    days: days.map((d) => ({
      date: d.date,
      totals: totalsOf(d.snapshot.stats),
    })),
    projects: Object.entries(projectMs)
      .map(([id, ms]) => ({ id, name: names.get(id) ?? "已不存在的项目", ms }))
      .sort((a, b) => b.ms - a.ms),
    categories: Object.entries(categoryMs)
      .map(([key, ms]) => ({ key, label: categoryLabel(key), ms }))
      .sort((a, b) => b.ms - a.ms),
    observations: [],
  };
  model.observations = observe(model);
  return model;
}

function observe(m: ReportModel): string[] {
  const t = m.totals;
  if (!t.activeMs) return ["这段时间没有电脑活动记录。"];
  const out = [
    `有 ${percent(t.focusMs, t.activeMs)}% 的电脑活动（${duration(t.focusMs)} / ${duration(t.activeMs)}）被判定为与当时目标相关。这是时间构成，不是评分。`,
  ];
  if (t.deepMs)
    out.push(
      `${duration(t.deepMs)} 属于连续 25 分钟以上的相关时段；最长一段 ${duration(t.longestFocusMs)}。`,
    );
  else
    out.push(
      `没有达到 25 分钟门槛的连续相关时段；最长一段 ${duration(t.longestFocusMs)}。`,
    );
  if (t.unknownMs)
    out.push(
      `${duration(t.unknownMs)} 的活动相关性仍待确认，可在活动详情中纠正，或为项目补充关键词。`,
    );
  if (t.distractedMs || t.interruptionMs)
    out.push(
      `明显分心 ${duration(t.distractedMs)}（${t.distractionCount} 段），短暂打断 ${duration(t.interruptionMs)}。`,
    );
  if (t.backgroundMs)
    out.push(
      `后台任务运行 ${duration(t.backgroundMs)}（去重），其中 ${duration(t.parallelMs)} 与人的其他工作同时发生；这部分不计入人的时间。`,
    );
  if (m.kind === "week") {
    const recorded = m.days.filter((d) => d.totals.activeMs > 0).length;
    out.push(`七天中有 ${recorded} 天有电脑活动记录。`);
  }
  return out;
}

export const methodNotes = [
  "人的时间只来自主注意力轨道，按时间区间去重；辅助窗口只提供上下文，不增加时长。",
  "深度工作：同一天内连续相关活动至少 25 分钟的完整时段之和；跨午夜的专注按各日分别判断。",
  "无关活动连续至少 3 分钟计为分心，较短的记为短暂打断；无目标或无法判断时保持待确认。",
  "后台任务使用显式的开始与结束信号；运行时长按区间去重，并行时长是与人的其他活动的交集。",
  "七日汇总由七个单日统计组成：时长逐日相加，最长连续专注取最大值，碎片化按每日无关片段数重新计算。",
  "所有数字由本机统计引擎计算，无 AI 推测。",
  "目标下记录时间包含该目标期间的相关、打断及待确认活动，并不等于净相关时间。",
];

const clean = (x: string) => x.replace(/[\r\n|]/g, " ");

/** Markdown export. Aggregates only — no individual window titles. */
export function reportMarkdown(m: ReportModel): string {
  const t = m.totals;
  const lines: string[] = [];
  lines.push(`# PC Insight · ${m.kind === "week" ? "七日" : "每日"}回顾`, "");
  lines.push(
    `${m.rangeLabel}（${m.startDate}${m.kind === "week" ? ` — ${m.endDate}` : ""}）${m.demo ? " · 演示数据" : ""}`,
    "",
  );
  lines.push("## 人的时间", "");
  lines.push(
    `- 电脑活动：${duration(t.activeMs)}`,
    `- 目标相关时间：${duration(t.focusMs)}`,
    `- 深度工作：${duration(t.deepMs)}`,
    `- 最长连续专注：${duration(t.longestFocusMs)}`,
    `- 分心：${duration(t.distractedMs)}（${t.distractionCount} 段）`,
    `- 短暂打断：${duration(t.interruptionMs)}`,
    `- 待确认：${duration(t.unknownMs)}`,
    `- 离开 / 休息：${duration(t.idleMs)}`,
    `- 窗口内容切换：${t.switches} 次`,
    `- 无关片段 / 活动小时：${t.fragmentation.toFixed(1)}`,
    "",
  );
  lines.push("## 机器时间（不计入人的时间）", "");
  lines.push(
    `- 自动任务运行（去重）：${duration(t.backgroundMs)}`,
    `- 与人的其他工作并行：${duration(t.parallelMs)}`,
    "",
  );
  if (m.kind === "week") {
    lines.push(
      "## 逐日",
      "",
      "| 日期 | 电脑活动 | 专注 | 深度工作 | 待确认 |",
      "| --- | ---: | ---: | ---: | ---: |",
    );
    for (const d of m.days)
      lines.push(
        `| ${shortDate(d.date)} ${weekday(d.date)} | ${duration(d.totals.activeMs)} | ${duration(d.totals.focusMs)} | ${duration(d.totals.deepMs)} | ${duration(d.totals.unknownMs)} |`,
      );
    lines.push("");
  }
  lines.push("## 目标下记录时间", "");
  if (m.projects.length)
    for (const p of m.projects)
      lines.push(`- ${clean(p.name)}：${duration(p.ms)}`);
  else lines.push("- 没有归入项目的活动");
  lines.push("");
  lines.push("## 观察", "");
  m.observations.forEach((o, i) => lines.push(`${i + 1}. ${o}`));
  lines.push("", "## 统计口径", "");
  for (const n of methodNotes) lines.push(`- ${n}`);
  lines.push("");
  return lines.join("\n");
}

export function reportFileName(m: ReportModel): string {
  return m.kind === "week"
    ? `PC-Insight-${m.startDate}_${m.endDate}-week.md`
    : `PC-Insight-${m.endDate}-day.md`;
}
