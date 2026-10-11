import type { Activity, Job, Snapshot } from "../packages/types";
import { demo } from "../apps/desktop/src/demo";

export const MIN = 60_000;

let n = 0;
export function act(
  start: number,
  end: number,
  state: string,
  extra: Partial<Activity> = {},
): Activity {
  return {
    id: `t${++n}`,
    source: "native",
    start,
    end,
    process: "Code.exe",
    title: "work",
    domain: "",
    intentId: "p",
    role: "primary",
    idle: state === "idle",
    area: 0.5,
    category: "coding",
    relation:
      state === "focused"
        ? "related"
        : state === "distracted" || state === "interruption"
          ? "unrelated"
          : "unknown",
    state,
    confidence: 0.9,
    reason: "test",
    ...extra,
  };
}

export function job(
  start: number,
  end: number | null,
  extra: Partial<Job> = {},
): Job {
  return {
    id: `j${++n}`,
    tool: "codex",
    name: "job",
    projectId: null,
    start,
    end,
    lastSeen: end ?? start,
    status: end == null ? "running" : "completed",
    foregroundMs: 0,
    backgroundMs: 0,
    parallelMs: 0,
    ...extra,
  };
}

export function workspace(activities: Activity[], jobs: Job[] = []): Snapshot {
  return {
    ...structuredClone(demo),
    activities,
    jobs,
    projects: [
      {
        id: "p",
        name: "测试项目",
        category: "coding",
        color: "#5e7a55",
        keywords: [],
      },
    ],
  };
}

export const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
