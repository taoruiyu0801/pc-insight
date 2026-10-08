import type {
  Activity,
  Snapshot,
  Stats,
  Session,
  Job,
} from "../../../packages/types";
import { bounds, localDate } from "./format";
export const emptyStats = (): Stats => ({
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
  projectMs: {},
  categoryMs: {},
});
const base = bounds(localDate())[0];
const minute = 60_000;
const activity = (
  id: string,
  from: number,
  to: number,
  process: string,
  title: string,
  intentId: string | null,
  state: string,
  role: "primary" | "supporting" = "primary",
): Activity => ({
  id,
  source: "demo",
  start: base + from * minute,
  end: base + to * minute,
  process,
  title,
  domain:
    process === "msedge.exe"
      ? state === "distracted"
        ? "bilibili.com"
        : "netacad.com"
      : "",
  intentId,
  role,
  idle: state === "idle",
  area: role === "supporting" ? 0.46 : 0.54,
  category:
    state === "distracted"
      ? "entertainment"
      : state === "interruption"
        ? "communication"
        : intentId === "research"
          ? "research"
          : intentId === "project"
            ? "coding"
            : "learning",
  relation:
    state === "focused"
      ? "related"
      : state === "distracted" || state === "interruption"
        ? "unrelated"
        : "unknown",
  state,
  confidence: 0.95,
  reason:
    state === "focused"
      ? "演示：匹配当前目标关键词"
      : state === "idle"
        ? "演示：休息时间"
        : "演示：与当前目标类别无关",
});
export const demo: Snapshot = {
  collectorSource: "演示",
  awStatus: "演示模式不连接本机服务",
  activities: [
    activity(
      "a1",
      540,
      579,
      "msedge.exe",
      "Cisco · Switching concepts",
      "cisco",
      "focused",
    ),
    activity(
      "a2",
      579,
      607,
      "Typora.exe",
      "CCNA 学习笔记.md",
      "cisco",
      "focused",
    ),
    activity(
      "a3",
      607,
      611,
      "msedge.exe",
      "Bilibili · 视频推荐",
      "cisco",
      "distracted",
    ),
    activity(
      "a4",
      611,
      641,
      "Typora.exe",
      "CCNA 学习笔记.md",
      "cisco",
      "focused",
    ),
    activity("a5", 641, 656, "休息", "", null, "idle"),
    activity(
      "a6",
      656,
      701,
      "Code.exe",
      "PC Insight · Session engine",
      "project",
      "focused",
    ),
    activity("a7", 701, 702, "WeChat.exe", "微信", "project", "interruption"),
    activity(
      "a8",
      702,
      740,
      "Code.exe",
      "PC Insight · Analytics",
      "project",
      "focused",
    ),
    activity(
      "a9",
      780,
      824,
      "Zotero.exe",
      "SPAD · Literature review",
      "research",
      "focused",
    ),
    activity(
      "a10",
      824,
      848,
      "Typora.exe",
      "SPAD research notes",
      "research",
      "focused",
    ),
    activity(
      "s1",
      540,
      607,
      "Typora.exe",
      "CCNA 学习笔记.md",
      "cisco",
      "focused",
      "supporting",
    ),
    activity(
      "s2",
      611,
      641,
      "msedge.exe",
      "Cisco · Switching concepts",
      "cisco",
      "focused",
      "supporting",
    ),
    activity(
      "s3",
      656,
      740,
      "msedge.exe",
      "Rust documentation",
      "project",
      "focused",
      "supporting",
    ),
  ],
  sessions: [],
  jobs: [
    {
      id: "j1",
      tool: "codex",
      name: "实现 Session 合并引擎",
      projectId: "project",
      start: base + 557 * minute,
      end: base + 628 * minute,
      lastSeen: base + 628 * minute,
      status: "completed",
      foregroundMs: 0,
      backgroundMs: 71 * minute,
      parallelMs: 71 * minute,
    },
    {
      id: "j2",
      tool: "python",
      name: "SPAD 数据预处理",
      projectId: "research",
      start: base + 790 * minute,
      end: base + 830 * minute,
      lastSeen: base + 830 * minute,
      status: "completed",
      foregroundMs: 0,
      backgroundMs: 40 * minute,
      parallelMs: 40 * minute,
    },
  ],
  stats: emptyStats(),
  projects: [
    {
      id: "cisco",
      name: "Cisco CCNA 学习",
      category: "learning",
      color: "#55846e",
      keywords: ["Cisco", "CCNA", "netacad"],
    },
    {
      id: "project",
      name: "PC Insight",
      category: "coding",
      color: "#748eae",
      keywords: ["PC Insight", "newtool", "Rust"],
    },
    {
      id: "research",
      name: "SPAD 研究",
      category: "research",
      color: "#9a87b1",
      keywords: ["SPAD"],
    },
  ],
  rules: [],
  settings: {
    collectorSource: "auto",
    sampleSeconds: 2,
    idleSeconds: 180,
    retentionDays: 60,
    recordTitles: true,
    excludedApps: [],
    excludedTitles: ["InPrivate", "Incognito", "无痕"],
    browserToken: "demo-no-real-token",
  },
  recording: false,
  breaking: false,
  intentId: "cisco",
  lastSample: null,
  currentApp: null,
  error: null,
  bridgeReady: false,
  bridgeError: null,
  browserConnected: false,
  databasePath: "演示模式 · 仅保存在本次浏览器页面内",
};

export function demoSnapshot(start: number, end: number): Snapshot {
  const data = structuredClone(demo);
  data.activities = data.activities
    .filter((a) => a.start < end && a.end > start)
    .map((a) => ({
      ...a,
      start: Math.max(start, a.start),
      end: Math.min(end, a.end),
    }));
  const stats = emptyStats();
  let focusStart = 0,
    focusEnd = 0;
  let previous: Activity | undefined;
  let unrelated = false;
  const flush = () => {
    const d = focusEnd - focusStart;
    stats.longestFocusMs = Math.max(stats.longestFocusMs, d);
    if (d >= 25 * minute) stats.deepMs += d;
    focusStart = 0;
    focusEnd = 0;
  };
  const sessions: Session[] = [];
  for (const a of data.activities.filter((a) => a.role === "primary")) {
    const d = a.end - a.start;
    if (a.idle) {
      stats.idleMs += d;
      flush();
      previous = undefined;
      unrelated = false;
      continue;
    }
    stats.activeMs += d;
    stats.categoryMs[a.category] = (stats.categoryMs[a.category] ?? 0) + d;
    if (a.intentId)
      stats.projectMs[a.intentId] = (stats.projectMs[a.intentId] ?? 0) + d;
    if (a.state === "focused") {
      stats.focusMs += d;
      if (focusEnd !== a.start) flush();
      if (!focusStart) focusStart = a.start;
      focusEnd = a.end;
    } else {
      flush();
      if (a.state === "distracted") stats.distractedMs += d;
      else if (["interruption", "micro"].includes(a.state))
        stats.interruptionMs += d;
      else stats.unknownMs += d;
    }
    if (a.state === "distracted" && (!unrelated || previous?.end !== a.start))
      stats.distractionCount++;
    unrelated = a.state === "distracted";
    if (
      previous &&
      previous.end === a.start &&
      (previous.process !== a.process || previous.title !== a.title)
    )
      stats.switches++;
    let session = sessions.at(-1);
    if (
      !session ||
      session.intentId !== a.intentId ||
      a.start - session.end >= 5 * minute
    ) {
      session = {
        id: `session:${a.id}`,
        intentId: a.intentId,
        start: a.start,
        end: a.end,
        activeMs: 0,
        focusMs: 0,
        activityIds: [],
      };
      sessions.push(session);
    }
    session.end = a.end;
    session.activeMs += d;
    session.focusMs += a.state === "focused" ? d : 0;
    session.activityIds.push(a.id);
    previous = a;
  }
  flush();
  data.jobs = data.jobs.filter(
    (j) => j.start < end && (j.end ?? Date.now()) > start,
  );
  const merge = (spans: [number, number][]) => {
    spans.sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const [s, e] of spans) {
      if (e <= s) continue;
      const last = out.at(-1);
      if (last && s <= last[1]) last[1] = Math.max(e, last[1]);
      else out.push([s, e]);
    }
    return out.reduce((sum, [s, e]) => sum + e - s, 0);
  };
  const jobSpans: [number, number][] = [];
  const overlaps: [number, number][] = [];
  for (const j of data.jobs) {
    const s = Math.max(start, j.start),
      e = Math.min(end, j.end ?? Date.now());
    jobSpans.push([s, e]);
    const relevant = data.activities.filter(
      (a) => a.role === "primary" && !a.idle,
    );
    const fg = relevant
      .filter((a) => a.process.toLowerCase().includes(j.tool))
      .map(
        (a) => [Math.max(s, a.start), Math.min(e, a.end)] as [number, number],
      );
    const ov = relevant
      .filter((a) => !a.process.toLowerCase().includes(j.tool))
      .map(
        (a) => [Math.max(s, a.start), Math.min(e, a.end)] as [number, number],
      );
    j.foregroundMs = merge(fg);
    j.backgroundMs = e - s - j.foregroundMs;
    j.parallelMs = merge(ov);
    overlaps.push(...ov);
  }
  stats.backgroundMs = merge(jobSpans);
  stats.parallelMs = merge(overlaps);
  stats.fragmentation = stats.activeMs
    ? stats.distractionCount / (stats.activeMs / 3_600_000)
    : 0;
  data.stats = stats;
  data.sessions = sessions;
  return data;
}
export function addDemoJob(
  name: string,
  tool: string,
  projectId: string | null,
): void {
  const now = Date.now();
  const job: Job = {
    id: crypto.randomUUID(),
    tool,
    name,
    projectId,
    start: now,
    end: null,
    lastSeen: now,
    status: "running",
    foregroundMs: 0,
    backgroundMs: 0,
    parallelMs: 0,
  };
  demo.jobs.push(job);
}
