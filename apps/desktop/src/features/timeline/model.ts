import type {
  Activity,
  Job,
  Project,
  Session,
  Snapshot,
} from "../../../../../packages/types";
import { duration, time, timeWithSeconds } from "../../lib/format";
import {
  appName,
  jobStatusInfo,
  stateInfo,
  toolLabel,
} from "../../lib/semantics";
import { pack } from "./layout";

export type LaneId = "goal" | "attention" | "context" | "jobs" | "state";

export interface LaneItem {
  key: string;
  start: number;
  end: number;
  row: number;
  tone: string;
  label: string;
  activity?: Activity;
  session?: Session;
  job?: Job;
}

export interface Lane {
  id: LaneId;
  name: string;
  note: string;
  rows: number;
  items: LaneItem[];
}

export function buildLanes(
  data: Snapshot,
  projects: Map<string, Project>,
  nowMs: number,
): Lane[] {
  const primary: Activity[] = [];
  const supporting: Activity[] = [];
  for (const a of data.activities)
    (a.role === "primary" ? primary : supporting).push(a);
  primary.sort((a, b) => a.start - b.start);

  const goal: LaneItem[] = data.sessions.map((s) => ({
    key: `g:${s.id}`,
    start: s.start,
    end: s.end,
    row: 0,
    tone: s.intentId ?? "none",
    label: projects.get(s.intentId ?? "")?.name ?? "未设置目标",
    session: s,
  }));

  const attention: LaneItem[] = primary.map((a, i) => ({
    key: `p:${a.id}:${a.start}:${i}`,
    start: a.start,
    end: a.end,
    row: 0,
    // Consecutive samples of the same app merge visually only when sub-pixel.
    tone: a.idle ? "idle" : `app:${a.process.toLowerCase()}`,
    label: a.idle ? "离开" : appName(a.process),
    activity: a,
  }));

  const context: LaneItem[] = pack(supporting).map(({ item: a, row }, i) => ({
    key: `s:${a.id}:${a.start}:${i}`,
    start: a.start,
    end: a.end,
    row,
    tone: "support",
    label: a.title || appName(a.process),
    activity: a,
  }));

  const jobs: LaneItem[] = pack(
    data.jobs.map((j) => ({
      ...j,
      end: j.end ?? Math.max(j.start, nowMs),
      raw: j,
    })),
  ).map(({ item, row }) => ({
    key: `j:${item.id}`,
    start: item.start,
    end: item.end,
    row,
    tone: jobStatusInfo(item.raw.status).running ? "job-running" : "job",
    label: `${toolLabel(item.tool)} · ${item.name}`,
    job: item.raw,
  }));

  const state: LaneItem[] = primary.map((a, i) => ({
    key: `t:${a.id}:${a.start}:${i}`,
    start: a.start,
    end: a.end,
    row: 0,
    tone: stateInfo(a.state, a.idle).tone,
    label: stateInfo(a.state, a.idle).label,
    activity: a,
  }));

  const rows = (items: LaneItem[]) =>
    items.reduce((m, x) => Math.max(m, x.row + 1), 1);
  return [
    { id: "goal", name: "当前目标", note: "会话", rows: 1, items: goal },
    {
      id: "attention",
      name: "主注意力",
      note: "人的时间",
      rows: 1,
      items: attention,
    },
    {
      id: "context",
      name: "辅助上下文",
      note: "可见，不计时",
      rows: Math.min(rows(context), 6),
      items: context,
    },
    {
      id: "jobs",
      name: "后台任务",
      note: "并行，不相加",
      rows: Math.min(rows(jobs), 6),
      items: jobs,
    },
    {
      id: "state",
      name: "工作状态",
      note: "专注 / 打断 / 待确认",
      rows: 1,
      items: state,
    },
  ];
}

export function describe(
  item: LaneItem,
  projects: Map<string, Project>,
): string {
  const span = `${time(item.start)}–${time(item.end)}，${duration(item.end - item.start, true)}`;
  if (item.activity) {
    const a = item.activity;
    const st = stateInfo(a.state, a.idle).label;
    const proj = projects.get(a.intentId ?? "")?.name;
    const what = a.title
      ? `${appName(a.process)}「${a.title}」`
      : appName(a.process);
    return `${what}，${span}，${st}${proj ? `，目标 ${proj}` : ""}${a.role === "supporting" ? "，辅助上下文" : ""}`;
  }
  if (item.job)
    return `后台任务 ${item.label}，${span}，${jobStatusInfo(item.job.status).label}`;
  if (item.session)
    return `目标会话 ${item.label}，${span}，其中专注 ${duration(item.session.focusMs)}`;
  return span;
}

export function preciseSpan(item: { start: number; end: number }): string {
  return `${timeWithSeconds(item.start)} – ${timeWithSeconds(item.end)}`;
}
