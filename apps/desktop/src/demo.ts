import type {
  Activity,
  Snapshot,
  Stats,
  Session,
  Job,
} from "../../../packages/types";
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
): Snapshot {
  const data = structuredClone(source);
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
