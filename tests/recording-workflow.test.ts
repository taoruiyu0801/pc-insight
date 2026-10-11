import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../apps/desktop/src/api";
import {
  demo,
  demoBatches,
  demoControls,
  demoPreview,
  demoSnapshot,
} from "../apps/desktop/src/demo";
import {
  groupActivities,
  learningTool,
  membersOf,
  spanOf,
} from "../apps/desktop/src/lib/activity-groups";
import { freezeClock } from "../apps/desktop/src/lib/clock";
import { act, workspace } from "./helpers";
import type { CorrectionRequest } from "../packages/types";

const base = new Date(2026, 9, 8, 10).getTime();
const initial = structuredClone(demo);
beforeEach(() => {
  Object.assign(demo, workspace([]));
  demo.projects[0].category = "learning";
  demo.intentId = null;
  demo.recording = false;
  demoBatches.length = 0;
  demoControls.length = 0;
  freezeClock(base);
});
afterEach(() => {
  Object.assign(demo, structuredClone(initial));
  demoBatches.length = 0;
  demoControls.length = 0;
  freezeClock(null);
});

describe("recording entry and session boundaries", () => {
  it("requires an explicit choice on each unassigned start and when clearing a live goal", async () => {
    expect(await api.recording(true)).toBe(false);
    expect(demo.recording).toBe(false);
    expect(await api.recording(true, false, true)).toBe(true);
    await api.recording(false);
    expect(await api.recording(true)).toBe(false);
    await api.intent("p");
    expect(await api.recording(true)).toBe(true);
    expect(await api.intent(null)).toBe(false);
    expect(demo.intentId).toBe("p");
    expect(await api.intent(null, true)).toBe(true);
    expect(demo.intentId).toBeNull();
  });
  it("merges exactly five minutes without counting the gap and observes goal boundaries", () => {
    const a = act(base, base + 1000, "focused"),
      b = act(base + 301000, base + 302000, "focused");
    demo.activities = [a, b];
    let snap = demoSnapshot(base, base + 400000);
    expect(snap.sessions).toHaveLength(1);
    expect(snap.sessions[0].activeMs).toBe(2000);
    demoControls.push({ at: base + 2000, kind: "intent", intentId: "other" });
    expect(demoSnapshot(base, base + 400000).sessions).toHaveLength(2);
    demoControls.length = 0;
    b.start++;
    expect(demoSnapshot(base, base + 400000).sessions).toHaveLength(2);
  });
  it("shows separate daily sessions across midnight without altering total time", () => {
    const midnight = new Date(2026, 9, 9).getTime();
    demo.activities = [act(midnight - 60000, midnight + 60000, "focused")];
    const snap = demoSnapshot(midnight - 60000, midnight + 60000);
    expect(snap.sessions).toHaveLength(2);
    expect(snap.stats.activeMs).toBe(120000);
  });
});

describe("grouped presentation and suggestions", () => {
  it("ignores area fluctuations but preserves member ranges, actual gaps and judgments", () => {
    const a = act(base, base + 2000, "focused", { area: 0.34 }),
      b = act(base + 2000, base + 4000, "focused", { area: 0.36 });
    const groups = groupActivities([a, b]);
    expect(groups).toHaveLength(1);
    expect(membersOf(groups[0])).toEqual([a, b]);
    expect(groups[0].end - groups[0].start).toBe(4000);
    expect(groupActivities([a, { ...b, start: b.start + 1 }])).toHaveLength(2);
    expect(
      groupActivities([a, { ...b, state: "unknown", relation: "unknown" }]),
    ).toHaveLength(2);
  });
  it("does not merge identical windows across an explicit session boundary", () => {
    const a = act(base, base + 2000, "focused"),
      b = act(base + 2000, base + 4000, "focused");
    demo.activities = [a, b];
    demoControls.push({ at: b.start, kind: "intent", intentId: "p" });
    const snap = demoSnapshot(base, base + 4000);
    expect(groupActivities(snap.activities, snap.sessions)).toHaveLength(2);
  });
  it("suggests known tools while keeping unidentified browser pages unknown", () => {
    const chat = act(base, base + 30000, "unknown", { process: "ChatGPT.exe" });
    const web = act(base + 30000, base + 60000, "unknown", {
      process: "msedge.exe",
      title: "Question",
      domain: "",
    });
    demo.activities = [chat, web];
    const snap = demoSnapshot(base, base + 60000);
    expect(snap.stats.focusMs).toBe(0);
    expect(snap.sessions[0].suggestions).toHaveLength(1);
    expect(learningTool(web)).toBeNull();
  });
});

describe("range correction preview, commit and undo", () => {
  const request = (
    a: ReturnType<typeof act>,
    start: number,
    end: number,
    relation: "related" | "unrelated" = "related",
  ): CorrectionRequest => ({
    ranges: [{ activityId: a.id, start, end }],
    change: {
      category: "learning",
      relation,
      overrideIntent: true,
      intentId: "p",
    },
  });
  it("leaves the source immutable, bounds the correction, dedupes writes and preserves later decisions on undo", async () => {
    const a = act(base, base + 60000, "unknown", { process: "ChatGPT.exe" });
    demo.activities = [a];
    const first = request(a, base + 10000, base + 40000);
    const p = demoPreview(first);
    expect(p.after.focusMs).toBe(30000);
    await api.commitCorrections("one", first, p.token, "First");
    await api.commitCorrections("one", first, p.token, "First");
    expect(demoBatches).toHaveLength(1);
    expect(a.state).toBe("unknown");
    const next = request(a, base + 20000, base + 30000, "unrelated"),
      q = demoPreview(next);
    await api.commitCorrections("two", next, q.token, "Later");
    await api.undoCorrection("one");
    const s = demoSnapshot(base, base + 60000);
    expect(s.stats.focusMs).toBe(0);
    expect(s.stats.interruptionMs).toBe(10000);
    expect(s.stats.unknownMs).toBe(50000);
    await api.undoCorrection("two");
    expect(demoSnapshot(base, base + 60000).stats.unknownMs).toBe(60000);
  });
  it("rejects a stale preview and never counts overlapping selections twice", async () => {
    const a = act(base, base + 60000, "unknown");
    demo.activities = [a];
    const r = request(a, base, base + 40000);
    r.ranges.push({ ...spanOf(a), start: base + 20000 });
    const p = demoPreview(r);
    expect(p.before.activeMs).toBe(60000);
    const normalized = { ...r, ranges: p.ranges };
    await api.commitCorrections("one", normalized, p.token, "First");
    await expect(
      api.commitCorrections("two", normalized, p.token, "Stale"),
    ).rejects.toThrow("重新预览");
  });
  it("conserves the approved anonymized learning example", () => {
    let t = base;
    const make = (ms: number, state: string, extra = {}) => {
      const a = act(t, t + ms, state, extra);
      t += ms;
      return a;
    };
    demo.activities = [
      make(1586215, "focused"),
      make(296446, "focused", { process: "ChatGPT.exe" }),
      ...Array.from({ length: 12 }, (_, i) => [
        make(i === 11 ? 68139 - 55000 : 5000, "interruption", {
          process: "Weixin.exe",
        }),
        make(i === 11 ? 292514 - 220000 : 20000, "unknown"),
      ]).flat(),
    ];
    const s = demoSnapshot(base, t).stats;
    expect(s.activeMs).toBe(2243314);
    expect(s.focusMs).toBe(1882661);
    expect(s.interruptionMs).toBe(68139);
    expect(s.unknownMs).toBe(292514);
    expect(s.distractedMs).toBe(0);
  });
});
