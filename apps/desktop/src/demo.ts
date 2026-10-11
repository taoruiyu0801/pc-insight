import type {
  Activity,
  Snapshot,
  Stats,
  Session,
  Job,
  CorrectionBatch,
  ControlEvent,
  CorrectionRequest,
  CorrectionPreview,
  CorrectionTotals,
} from "../../../packages/types";
import { now } from "./lib/clock";
import { learningTool, spanOf } from "./lib/activity-groups";
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
const minute = 60_000;
export const demoBatches: CorrectionBatch[] = [];
export const demoControls: ControlEvent[] = [];

// A browser test workspace starts empty. Seeded examples live only in tests/fixtures.
export const demo: Snapshot = {
  collectorSource: "演示",
  awStatus: "演示模式不连接本机服务",
  activities: [],
  sessions: [],
  jobs: [],
  stats: {
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
  },
  projects: [],
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
  intentId: null,
  lastSample: null,
  currentApp: null,
  error: null,
  bridgeReady: false,
  bridgeError: null,
  browserConnected: false,
  databasePath: "演示模式 · 仅保存在本次浏览器页面内",
};

export function demoSnapshot(
  start: number,
  end: number,
  source: Snapshot = demo,
  batches: CorrectionBatch[] = source === demo ? demoBatches : [],
  controls: ControlEvent[] = source === demo ? demoControls : [],
): Snapshot {
  const data = structuredClone(source);
  data.activities = data.activities
    .filter((a) => a.start < end && a.end > start)
    .map((a) => ({
      ...a,
      start: Math.max(start, a.start),
      end: Math.min(end, a.end),
    }));
  data.activities = data.activities
    .flatMap((a) => {
      const active = batches.filter(
        (b) =>
          b.undoneAt == null &&
          b.request.ranges.some(
            (r) => r.activityId === a.id && r.start < a.end && r.end > a.start,
          ),
      );
      const midnights: number[] = [];
      for (let d = new Date(a.start); ;) {
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        if (+d >= a.end) break;
        midnights.push(+d);
      }
      const edges = [
        ...new Set([
          a.start,
          a.end,
          ...midnights,
          ...active.flatMap((b) =>
            b.request.ranges
              .filter(
                (r) =>
                  r.activityId === a.id && r.start < a.end && r.end > a.start,
              )
              .flatMap((r) => [
                Math.max(a.start, r.start),
                Math.min(a.end, r.end),
              ]),
          ),
        ]),
      ].sort((x, y) => x - y);
      return edges.slice(0, -1).map((s, i) => {
        const piece = { ...a, start: s, end: edges[i + 1] };
        for (const b of active.filter((b) =>
          b.request.ranges.some(
            (r) =>
              r.activityId === a.id &&
              r.start <= piece.start &&
              r.end >= piece.end,
          ),
        )) {
          const c = b.request.change;
          if (c.overrideIntent) {
            piece.intentId = c.intentId;
            if (c.relation == null && !piece.reason.startsWith("人工纠正")) {
              const p = data.projects.find((p) => p.id === c.intentId);
              const text =
                `${piece.process} ${piece.title} ${piece.domain}`.toLowerCase();
              if (
                p?.keywords.some(
                  (k) => k.trim() && text.includes(k.toLowerCase()),
                )
              ) {
                piece.category = p.category;
                piece.relation = "related";
              } else piece.relation = "unknown";
            }
          }
          if (c.category != null) piece.category = c.category;
          if (c.relation != null) piece.relation = c.relation;
          if (!piece.intentId) piece.relation = "unknown";
          piece.state =
            piece.relation === "related"
              ? "focused"
              : piece.relation === "unrelated"
                ? "micro"
                : "unknown";
          piece.reason = "人工纠正（所选时段）";
        }
        return piece;
      });
    })
    .sort((a, b) => a.start - b.start);
  // Classify unrelated runs as a whole, including corrections spanning samples.
  let run: Activity[] = [];
  const flushRun = () => {
    const ms = run.reduce((n, a) => n + a.end - a.start, 0);
    for (const a of run)
      a.state =
        ms >= 180000 ? "distracted" : ms >= 15000 ? "interruption" : "micro";
    run = [];
  };
  for (const a of data.activities.filter((a) => a.role === "primary")) {
    const prev = run.at(-1);
    if (prev && (prev.end !== a.start || prev.intentId !== a.intentId))
      flushRun();
    if (a.relation === "unrelated" && !a.idle) run.push(a);
    else flushRun();
  }
  flushRun();
  const stats = emptyStats();
  let focusStart = 0,
    focusEnd = 0;
  let previous: Activity | undefined;
  // Mirrors pc_analytics::summarize: counts are unions of touching spans.
  const distractedSpans: [number, number][] = [];
  const unrelatedSpans: [number, number][] = [];
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
    if (a.state === "distracted") distractedSpans.push([a.start, a.end]);
    if (a.relation === "unrelated") unrelatedSpans.push([a.start, a.end]);
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
      a.start - session.end > 5 * minute ||
      new Date(a.start).toDateString() !==
        new Date(session.start).toDateString() ||
      controls.some(
        (c) => c.kind === "intent" && c.at >= session!.end && c.at <= a.start,
      )
    ) {
      session = {
        id: `session:${a.id}`,
        intentId: a.intentId,
        start: a.start,
        end: a.end,
        activeMs: 0,
        focusMs: 0,
        activityIds: [],
        interruptionMs: 0,
        distractedMs: 0,
        unknownMs: 0,
        members: [],
        suggestions: [],
      };
      sessions.push(session);
    }
    session.end = a.end;
    session.activeMs += d;
    session.focusMs += a.state === "focused" ? d : 0;
    session.activityIds.push(a.id);
    session.members.push(spanOf(a));
    if (["interruption", "micro"].includes(a.state))
      session.interruptionMs += d;
    else if (a.state === "distracted") session.distractedMs += d;
    else if (a.state !== "focused") session.unknownMs += d;
    const tool = learningTool(a);
    if (
      tool &&
      a.relation === "unknown" &&
      data.projects.some(
        (p) => p.id === a.intentId && p.category === "learning",
      )
    )
      session.suggestions.push({
        range: spanOf(a),
        tool,
        reason: "学习会话中的通用辅助工具，用途需你确认",
      });
    previous = a;
  }
  flush();
  const current = now();
  data.jobs = data.jobs.filter(
    (j) => j.start < end && (j.end ?? current) > start,
  );
  const merge = (spans: [number, number][]) =>
    union(spans).reduce((sum, [s, e]) => sum + e - s, 0);
  stats.distractionCount = union(distractedSpans).length;
  const jobSpans: [number, number][] = [];
  const overlaps: [number, number][] = [];
  for (const j of data.jobs) {
    const s = Math.max(start, j.start),
      e = Math.min(end, current, j.end ?? current);
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
    ? union(unrelatedSpans).length / (stats.activeMs / 3_600_000)
    : 0;
  // Returned jobs are clipped to the query range exactly like the Rust snapshot.
  for (const j of data.jobs) {
    j.start = Math.max(j.start, start);
    if (j.end !== null || end < current)
      j.end = Math.min(j.end ?? current, end);
  }
  data.stats = stats;
  data.sessions = sessions;
  // The browser workspace has no collector; report a heartbeat so the status line
  // reflects the toggle, while the current-app text says nothing is captured.
  if (data.recording) {
    data.lastSample = current;
    data.currentApp = data.breaking ? "休息中" : "演示模式不采集窗口";
  }
  return data;
}

export function demoPreview(request: CorrectionRequest): CorrectionPreview {
  if (!request.ranges.length) throw new Error("请选择记录");
  const ordered = request.ranges
    .slice()
    .sort(
      (a, b) => a.activityId.localeCompare(b.activityId) || a.start - b.start,
    );
  const ranges: typeof ordered = [];
  for (const r of ordered) {
    if (r.end <= r.start) throw new Error("时间范围无效");
    const prev = ranges.at(-1);
    if (prev?.activityId === r.activityId && r.start <= prev.end)
      prev.end = Math.max(prev.end, r.end);
    else ranges.push({ ...r });
  }
  const start = Math.min(...ranges.map((r) => r.start)),
    end = Math.max(...ranges.map((r) => r.end));
  const select = (snapshot: Snapshot) =>
    snapshot.activities
      .filter((a) => a.role === "primary" && !a.idle)
      .flatMap((a) =>
        ranges
          .filter(
            (r) => r.activityId === a.id && r.start < a.end && r.end > a.start,
          )
          .map((r) => ({
            ...a,
            start: Math.max(a.start, r.start),
            end: Math.min(a.end, r.end),
          })),
      );
  const sum = (list: Activity[]): CorrectionTotals =>
    list.reduce(
      (t, a) => {
        const d = a.end - a.start;
        t.activeMs += d;
        if (a.state === "focused") t.focusMs += d;
        else if (a.state === "distracted") t.distractedMs += d;
        else if (["micro", "interruption"].includes(a.state))
          t.interruptionMs += d;
        else t.unknownMs += d;
        return t;
      },
      {
        activeMs: 0,
        focusMs: 0,
        interruptionMs: 0,
        distractedMs: 0,
        unknownMs: 0,
      },
    );
  const before = select(demoSnapshot(start, end));
  if (sum(before).activeMs !== ranges.reduce((n, r) => n + r.end - r.start, 0))
    throw new Error("所选记录已改变，请重新选择");
  const relevant = demoBatches.filter((b) =>
    b.request.ranges.some((a) =>
      ranges.some(
        (r) =>
          r.activityId === a.activityId && r.start < a.end && r.end > a.start,
      ),
    ),
  );
  const signature = JSON.stringify([ranges, request.change, before, relevant]);
  let hash = 2166136261;
  for (let i = 0; i < signature.length; i++)
    hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
  const token = `${signature.length}:${hash >>> 0}`;
  const preview: CorrectionPreview = {
    token,
    ranges,
    before: sum(before),
    after: sum([]),
    overwrittenManualCount: before.filter((a) =>
      a.reason.startsWith("人工纠正"),
    ).length,
  };
  const batch: CorrectionBatch = {
    id: "preview",
    createdAt: 0,
    undoneAt: null,
    label: "",
    request: { ...request, ranges },
    preview,
  };
  preview.after = sum(
    select(demoSnapshot(start, end, demo, [...demoBatches, batch])),
  );
  return preview;
}
function union(spans: [number, number][]): [number, number][] {
  const sorted = spans.slice().sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [s, e] of sorted) {
    if (e <= s) continue;
    const last = out.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(e, last[1]);
    else out.push([s, e]);
  }
  return out;
}
export function addDemoJob(
  name: string,
  tool: string,
  projectId: string | null,
): void {
  const started = now();
  const job: Job = {
    id: crypto.randomUUID(),
    tool,
    name,
    projectId,
    start: started,
    end: null,
    lastSeen: started,
    status: "running",
    foregroundMs: 0,
    backgroundMs: 0,
    parallelMs: 0,
  };
  demo.jobs.push(job);
}
