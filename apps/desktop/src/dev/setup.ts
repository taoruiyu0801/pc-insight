// Development-only helpers for the browser demo. Imported from main.tsx behind
// `import.meta.env.DEV`, so production and Tauri builds never contain them.
//
//   ?demo=1&fixture=sample        seeded example workspace (tests/fixtures/demo.ts)
//   ?demo=1&fixture=stress&n=5000 synthetic stress workspace
//   ?demo=1&clock=2026-10-08T16:30 frozen clock for reproducible screenshots
//   ?demo=1&fault=snapshot        every snapshot fails
//   ?demo=1&fault=slow            snapshots take 3 s (slower than the 2 s poll)
//   ?demo=1&fault=after-write     the first snapshot after each write fails
import { api, native } from "../api";
import { demo } from "../demo";
import { freezeClock, now } from "../lib/clock";
import { bounds, localDate } from "../lib/dates";
import { getFetcher, setFetcher } from "../data/fetcher";

export async function setupDev(): Promise<void> {
  if (native) return;
  const params = new URLSearchParams(location.search);
  const clock = params.get("clock");
  if (clock && !Number.isNaN(Date.parse(clock))) freezeClock(Date.parse(clock));
  const base = bounds(localDate())[0];

  const fixture = params.get("fixture");
  if (fixture === "sample") {
    const { buildSampleDemo } = await import("../../../../tests/fixtures/demo");
    Object.assign(demo, buildSampleDemo(base));
  } else if (fixture === "stress") {
    const { buildStressDemo } =
      await import("../../../../tests/fixtures/stress");
    Object.assign(
      demo,
      buildStressDemo(base, Number(params.get("n")) || 1000, now()),
    );
  }
  if (params.get("recording") === "1") demo.recording = true;

  const fault = params.get("fault");
  const inner = getFetcher();
  if (fault === "snapshot")
    setFetcher(() => Promise.reject(new Error("模拟故障：snapshot 不可用")));
  if (fault === "slow")
    setFetcher(
      (s, e) => new Promise((res) => setTimeout(() => res(inner(s, e)), 3_000)),
    );
  if (fault === "after-write") {
    let failNext = false;
    setFetcher((s, e) => {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error("模拟故障：写入后刷新失败"));
      }
      return inner(s, e);
    });
    for (const key of [
      "project",
      "rule",
      "deleteRule",
      "correct",
      "settings",
      "startJob",
      "finishJob",
      "intent",
      "recording",
      "commitCorrections",
      "undoCorrection",
    ] as const) {
      const original = api[key] as (...args: unknown[]) => Promise<unknown>;
      (api as Record<string, unknown>)[key] = async (...args: unknown[]) => {
        const r = await original(...args);
        failNext = true;
        return r;
      };
    }
  }
}
