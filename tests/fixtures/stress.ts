import type { Activity, Job, Project, Snapshot } from "../../packages/types";
import { demo, emptyStats } from "../../apps/desktop/src/demo";

/** Deterministic PRNG so stress screenshots and measurements are repeatable. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const apps = [
  "Code.exe",
  "msedge.exe",
  "Typora.exe",
  "WeChat.exe",
  "python.exe",
  "Zotero.exe",
  "WindowsTerminal.exe",
];
const states = [
  "focused",
  "focused",
  "focused",
  "focused",
  "interruption",
  "micro",
  "distracted",
  "unknown",
];

/**
 * Synthetic stress workspace: `count` primary activities between 08:00 and 20:00,
 * 24 projects (some with very long names), overlapping supporting windows and
 * overlapping background jobs. Never written to a real database.
 */
export function buildStressDemo(
  base: number,
  count: number,
  nowMs: number,
): Snapshot {
  const r = rng(count);
  const projects: Project[] = Array.from({ length: 24 }, (_, i) => ({
    id: `p${i}`,
    name:
      i === 3
        ? "单光子雪崩二极管（SPAD）阵列时间相关计数实验数据预处理与长期稳定性分析项目第二阶段"
        : i === 7
          ? "AVeryLongProjectNameWithoutAnySpacesThatMustWrapOrTruncateSafely_2026"
          : `项目 ${String(i + 1).padStart(2, "0")} · ${["CCNA", "论文", "PC Insight", "数据", "课程"][i % 5]}`,
    category: ["learning", "research", "coding", "research", "learning"][
      i % 5
    ] as Project["category"],
    color: ["#5e7a52", "#53697e", "#9c4f38", "#8a6a2e", "#6d5a7e", "#4f7470"][
      i % 6
    ],
    keywords: Array.from({ length: (i % 5) + 1 }, (_, k) => `关键词${i}-${k}`),
  }));
  const start = base + 8 * 3_600_000;
  const span = 12 * 3_600_000;
  const avg = span / count;
  const activities: Activity[] = [];
  let t = start;
  for (let i = 0; i < count && t < start + span; i++) {
    const d = Math.max(2_000, Math.round(avg * (0.2 + r() * 1.6)));
    const state = r() < 0.03 ? "idle" : states[Math.floor(r() * states.length)];
    const intent = r() < 0.1 ? null : `p${Math.floor(r() * 6)}`;
    const process = apps[Math.floor(r() * apps.length)];
    activities.push({
      id: `x${i}`,
      source: r() < 0.5 ? "native" : "activitywatch",
      start: t,
      end: t + d,
      process: state === "idle" ? "休息" : process,
      title:
        state === "idle"
          ? ""
          : `${process.replace(".exe", "")} 窗口 ${i} · ${"很长的窗口标题 ".repeat(i % 7 === 0 ? 8 : 1)}`,
      domain:
        process === "msedge.exe"
          ? ["netacad.com", "bilibili.com", "docs.rs"][i % 3]
          : "",
      intentId: intent,
      role: "primary",
      idle: state === "idle",
      area: 0.6,
      category: [
        "coding",
        "learning",
        "research",
        "communication",
        "entertainment",
      ][i % 5] as Activity["category"],
      relation:
        state === "focused"
          ? "related"
          : state === "unknown" || !intent
            ? "unknown"
            : "unrelated",
      state: intent || state === "idle" ? state : "unknown",
      confidence: 0.8,
      reason: "合成压力测试数据",
    });
    t += d;
  }
  for (let i = 0; i < count / 10; i++) {
    const s = start + Math.floor(r() * span);
    activities.push({
      ...activities[i],
      id: `sx${i}`,
      role: "supporting",
      start: s,
      end: s + 60_000 + Math.floor(r() * 1_800_000),
      title: `辅助窗口 ${i}`,
      area: 0.2 + r() * 0.5,
    });
  }
  const jobs: Job[] = [0, 1, 2, 3].map((i) => ({
    id: `sj${i}`,
    tool: ["codex", "python", "claude", "npm"][i],
    name:
      i === 1
        ? "SPAD 数据预处理（很长的任务名称，用来检查列表与时间谱的截断）"
        : `后台任务 ${i + 1}`,
    projectId: `p${i}`,
    start: start + i * 2_400_000,
    end: i === 3 ? null : start + i * 2_400_000 + 5_400_000,
    lastSeen: nowMs,
    status: i === 3 ? "running" : i === 2 ? "failed" : "completed",
    foregroundMs: 0,
    backgroundMs: 0,
    parallelMs: 0,
  }));
  return {
    ...structuredClone(demo),
    activities,
    jobs,
    projects,
    stats: emptyStats(),
    intentId: "p3",
  };
}
