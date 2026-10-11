import { afterEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../packages/types";
import { demoSnapshot } from "../apps/desktop/src/demo";
import {
  SnapshotStore,
  resolveView,
  rangeKey,
} from "../apps/desktop/src/data/snapshot-store";
import { startPolling } from "../apps/desktop/src/data/poller";
import {
  executeMutation,
  PendingRegistry,
} from "../apps/desktop/src/data/mutations";
import { assembleReport } from "../apps/desktop/src/features/reports/assemble";
import {
  aggregateStats,
  buildReport,
  reportMarkdown,
} from "../apps/desktop/src/features/reports/report-model";
import { bounds, shiftDate } from "../apps/desktop/src/lib/dates";
import { duration } from "../apps/desktop/src/lib/format";
import { act, deferred, job, MIN, workspace } from "./helpers";

const fake = (tag: string): Snapshot => ({
  ...workspace([]),
  databasePath: tag,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("1 · range-bound responses", () => {
  it("a slow response for the old date never lands under the new date", async () => {
    const d1 = bounds("2026-10-07");
    const d2 = bounds("2026-10-08");
    const pending = new Map<string, ReturnType<typeof deferred<Snapshot>>>();
    const store = new SnapshotStore((s, e) => {
      const d = deferred<Snapshot>();
      pending.set(rangeKey(s, e), d);
      return d.promise;
    });
    const old = store.fetch(...d1);
    const fresh = store.fetch(...d2);
    pending.get(rangeKey(...d2))!.resolve(fake("oct-8"));
    await fresh;
    pending.get(rangeKey(...d1))!.resolve(fake("oct-7"));
    await old;
    expect(store.get(...d2)!.data!.databasePath).toBe("oct-8");
    expect(store.get(...d1)!.data!.databasePath).toBe("oct-7");
  });

  it("while switching, old data is shown only as transitional, labelled with its own range", () => {
    const d1 = bounds("2026-10-07");
    const d2 = bounds("2026-10-08");
    const store = new SnapshotStore(() => new Promise(() => {}));
    const previous = {
      key: rangeKey(...d1),
      start: d1[0],
      end: d1[1],
      data: fake("oct-7"),
      error: null,
      updatedAt: 1,
      version: 0,
      attempted: 0,
      fetching: false,
    };
    void store.fetch(...d2);
    const view = resolveView(store.get(...d2), previous, store.version);
    expect(view.transitional).toBe(true);
    expect(view.shownKey).toBe(rangeKey(...d1));
    expect(view.loading).toBe(true);
  });

  it("a newer request for the same range wins even if the older one answers last", async () => {
    const d = bounds("2026-10-08");
    const calls: ReturnType<typeof deferred<Snapshot>>[] = [];
    const store = new SnapshotStore(() => {
      const x = deferred<Snapshot>();
      calls.push(x);
      return x.promise;
    });
    const first = store.fetch(...d);
    store.invalidate(); // a write happened; must not reuse the pre-write request
    const second = store.fetch(...d);
    expect(calls).toHaveLength(2);
    calls[1].resolve(fake("after-write"));
    await second;
    calls[0].resolve(fake("before-write"));
    await first;
    expect(store.get(...d)!.data!.databasePath).toBe("after-write");
  });
});

describe("2 · export during a date switch", () => {
  it("has no report model until the requested date itself has loaded", async () => {
    const store = new SnapshotStore(() => new Promise(() => {}));
    const yesterday = new SnapshotStore(async () => fake("x"));
    await yesterday.fetch(...bounds("2026-10-07"));
    // Only 10-07 has data; the user switched to 10-08 and clicks export.
    const state = assembleReport(
      "day",
      "2026-10-08",
      (s, e) => yesterday.get(s, e) ?? store.get(s, e),
      true,
      store.version,
    );
    expect(state.status).toBe("loading");
    const ready = assembleReport(
      "day",
      "2026-10-07",
      (s, e) => yesterday.get(s, e),
      true,
      yesterday.version,
    );
    expect(ready.status === "ready" && ready.model.endDate).toBe("2026-10-07");
    if (ready.status === "ready") {
      expect(ready.model.start).toBe(bounds("2026-10-07")[0]);
      expect(reportMarkdown(ready.model)).toContain("2026-10-07");
    }
  });

  it("weekly export waits for all seven days and reports which days failed", async () => {
    let fail = "2026-10-05";
    const store = new SnapshotStore(async (s) => {
      if (s === bounds(fail)[0]) throw new Error("IPC 超时");
      return fake("ok");
    });
    for (let i = 0; i < 7; i++)
      await store.fetch(...bounds(shiftDate("2026-10-08", -i))).catch(() => {});
    const state = assembleReport(
      "week",
      "2026-10-08",
      (s, e) => store.get(s, e),
      false,
      store.version,
    );
    expect(state.status).toBe("error");
    if (state.status === "error")
      expect(state.failedDates).toEqual(["2026-10-05"]);
    fail = "";
    await store.fetch(...bounds("2026-10-05"));
    expect(
      assembleReport(
        "week",
        "2026-10-08",
        (s, e) => store.get(s, e),
        false,
        store.version,
      ).status,
    ).toBe("ready");
  });
});

describe("3 · polling slower than the interval", () => {
  it("never overlaps requests and applies every response", async () => {
    vi.useFakeTimers();
    let inflight = 0;
    let maxInflight = 0;
    let applied = 0;
    const store = new SnapshotStore(
      () =>
        new Promise<Snapshot>((resolve) => {
          inflight++;
          maxInflight = Math.max(maxInflight, inflight);
          setTimeout(() => {
            inflight--;
            resolve(fake(String(++applied)));
          }, 3_000); // slower than the 2 s poll
        }),
    );
    const d = bounds("2026-10-08");
    const poller = startPolling(
      () => store.fetch(...d),
      () => 2_000,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    poller.stop();
    expect(maxInflight).toBe(1);
    expect(applied).toBeGreaterThanOrEqual(5);
    expect(store.get(...d)!.data!.databasePath).toBe(String(applied));
  });

  it("dedupes concurrent fetches of the same range", async () => {
    const fetcher = vi.fn(async () => fake("x"));
    const store = new SnapshotStore(fetcher);
    const d = bounds("2026-10-08");
    await Promise.all([
      store.fetch(...d),
      store.fetch(...d),
      store.fetch(...d),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("a failed passive range is not retried in a tight loop", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("down");
    });
    const store = new SnapshotStore(fetcher);
    const d = bounds("2026-10-08");
    await store.ensure(...d);
    expect(store.ensure(...d)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.get(...d)!.error).toBe("down");
  });

  it("a later success clears the earlier query error", async () => {
    let ok = false;
    const store = new SnapshotStore(async () => {
      if (!ok) throw new Error("暂时不可用");
      return fake("ok");
    });
    const d = bounds("2026-10-08");
    await store.fetch(...d).catch(() => {});
    expect(store.get(...d)!.error).toBe("暂时不可用");
    ok = true;
    await store.fetch(...d);
    expect(store.get(...d)!.error).toBeNull();
  });
});

describe("4 · write succeeded, refresh failed", () => {
  it("reports saved-refresh-failed and never repeats the write", async () => {
    const write = vi.fn(async () => "created");
    const refresh = vi.fn(async () => {
      throw new Error("snapshot 失败");
    });
    const outcome = await executeMutation(write, refresh);
    expect(outcome.status).toBe("saved-refresh-failed");
    // The user retries the *refresh* only.
    await refresh().catch(() => {});
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("a failed write is reported as failed and skips the refresh", async () => {
    const refresh = vi.fn(async () => {});
    const outcome = await executeMutation(async () => {
      throw new Error("项目名称无效");
    }, refresh);
    expect(outcome).toEqual({ status: "failed", error: "项目名称无效" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("per-operation pending keys block double submits without locking other work", () => {
    const p = new PendingRegistry();
    expect(p.begin("project:new")).toBe(true);
    expect(p.begin("project:new")).toBe(false);
    expect(p.begin("job:j1")).toBe(true);
    p.end("job:j1");
    expect(p.has("project:new")).toBe(true);
    expect(p.has("job:j1")).toBe(false);
  });
});

describe("5 · week data follows writes and today's polling, not toasts", () => {
  it("invalidate marks every day stale; the polled day is shared with the week", async () => {
    let value = "v1";
    const store = new SnapshotStore(async () => fake(value));
    const days = Array.from({ length: 7 }, (_, i) =>
      bounds(shiftDate("2026-10-08", i - 6)),
    );
    for (const d of days) await store.fetch(...d);
    expect(days.every((d) => store.isFresh(store.get(...d)))).toBe(true);
    store.invalidate();
    expect(days.some((d) => store.isFresh(store.get(...d)))).toBe(false);
    value = "v2";
    // Today's live poll updates the same entry the week chart reads.
    await store.fetch(...days[6]);
    const week = assembleReport(
      "week",
      "2026-10-08",
      (s, e) => store.get(s, e),
      false,
      store.version,
    );
    expect(week.status).toBe("stale");
    expect(store.get(...days[6])!.data!.databasePath).toBe("v2");
  });
});

describe("6 · cross-midnight focus and distraction", () => {
  const day1 = "2026-10-07";
  const day2 = "2026-10-08";
  const midnight = bounds(day2)[0];
  const source = workspace([
    act(midnight - 20 * MIN, midnight + 20 * MIN, "focused"),
    act(midnight + 20 * MIN, midnight + 27 * MIN, "distracted", {
      relation: "unrelated",
    }),
  ]);
  const days = [day1, day2].map((date) => ({
    date,
    snapshot: demoSnapshot(...bounds(date), source),
  }));

  it("judges deep work per day and never sums longest focus", () => {
    expect(days[0].snapshot.stats.deepMs).toBe(0);
    expect(days[1].snapshot.stats.deepMs).toBe(0);
    const model = buildReport("week", days, false);
    expect(model.totals.deepMs).toBe(0);
    expect(model.totals.longestFocusMs).toBe(20 * MIN);
    expect(model.totals.focusMs).toBe(40 * MIN);
    // A single 2-day query would call it 40 min of deep work — the report does not use that path.
    const merged = demoSnapshot(bounds(day1)[0], bounds(day2)[1], source);
    expect(merged.stats.deepMs).toBe(40 * MIN);
  });

  it("preview numbers and Markdown come from the same model", () => {
    const model = buildReport("week", days, true);
    const md = reportMarkdown(model);
    expect(md).toContain(`深度工作：${duration(model.totals.deepMs)}`);
    expect(md).toContain(
      `最长连续专注：${duration(model.totals.longestFocusMs)}`,
    );
    expect(md).toContain(`电脑活动：${duration(model.totals.activeMs)}`);
    expect(md).toContain("演示数据");
    expect(md).not.toContain("work"); // no raw window titles
  });

  it("recomputes fragmentation from per-day unrelated span counts", () => {
    const t = aggregateStats(days.map((d) => d.snapshot.stats));
    const spans = days.reduce(
      (n, d) =>
        n +
        Math.round(
          d.snapshot.stats.fragmentation *
            (d.snapshot.stats.activeMs / 3_600_000),
        ),
      0,
    );
    expect(spans).toBe(1);
    expect(t.fragmentation).toBeCloseTo(spans / (t.activeMs / 3_600_000));
  });
});

describe("7 · overlapping background jobs", () => {
  it("never adds job time to human time or double-counts parallel time", () => {
    const base = bounds("2026-10-08")[0] + 9 * 60 * MIN;
    const s = demoSnapshot(
      ...bounds("2026-10-08"),
      workspace(
        [act(base, base + 60 * MIN, "focused")],
        [
          job(base, base + 60 * MIN),
          job(base + 30 * MIN, base + 90 * MIN, { tool: "python" }),
        ],
      ),
    ).stats;
    expect(s.activeMs).toBe(60 * MIN);
    expect(s.backgroundMs).toBe(90 * MIN);
    expect(s.parallelMs).toBe(60 * MIN);
    expect(s.parallelMs).toBeLessThanOrEqual(s.activeMs);
  });

  it("clips returned jobs to the queried day like the Rust snapshot", () => {
    const d = bounds("2026-10-08");
    const snap = demoSnapshot(
      ...d,
      workspace([], [job(d[0] - 60 * MIN, d[0] + 60 * MIN)]),
    );
    expect(snap.jobs[0].start).toBe(d[0]);
    expect(snap.jobs[0].end).toBe(d[0] + 60 * MIN);
  });
});
