import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RangeNotice } from "../apps/desktop/src/app/PageHeader";
import {
  SnapshotStore,
  resolveView,
} from "../apps/desktop/src/data/snapshot-store";
import { assembleReport } from "../apps/desktop/src/features/reports/assemble";
import { bounds, weekDates } from "../apps/desktop/src/lib/dates";
import { deferred, workspace } from "./helpers";
import type { Snapshot } from "../packages/types";
import {
  editSettings,
  fromDraft,
  isDirty,
  settingsEditor,
  type SettingsEditor,
} from "../apps/desktop/src/features/settings/draft";

describe("settings edits during saving", () => {
  const base = workspace([]).settings;
  const begin = () => {
    let state = editSettings(settingsEditor(base), {
      type: "edit",
      patch: { excludedApps: "saved.exe, saved.exe\n" },
    });
    return editSettings(state, {
      type: "begin",
      settings: fromDraft(state.draft, state.base),
    });
  };
  const sync = (state: SettingsEditor, settings = state.base, fresh = true) =>
    editSettings(state, { type: "snapshot", settings, fresh });

  it("normalizes a submitted draft only when there were no later edits", () => {
    const state = editSettings(begin(), { type: "saved" });
    expect(state.draft.excludedApps).toBe("saved.exe");
    expect(isDirty(state.draft, state.base)).toBe(false);
  });

  it.each(["typed-during-save.exe", base.excludedApps.join("\n")])(
    "retains subsequent input %j across the save echo and completion",
    (input) => {
      let state = begin();
      const submitted = state.submission!.settings;
      state = editSettings(state, {
        type: "edit",
        patch: { excludedApps: input },
      });
      state = sync(state, submitted);
      expect(state.draft.excludedApps).toBe(input);
      expect(state.external).toBe(false);
      state = editSettings(state, { type: "saved" });
      state = sync(state, submitted);
      expect(state.base.excludedApps).toEqual(["saved.exe"]);
      expect(state.draft.excludedApps).toBe(input);
      expect(isDirty(state.draft, state.base)).toBe(true);
      expect(state.savedWithEdits).toBe(true);
      expect(state.external).toBe(false);
    },
  );

  it("preserves input and the previous base when a write fails", () => {
    let state = editSettings(begin(), {
      type: "edit",
      patch: { excludedApps: "new.exe" },
    });
    state = editSettings(state, { type: "failed" });
    expect(state.base).toBe(base);
    expect(state.draft.excludedApps).toBe("new.exe");
    expect(state.submission).toBeNull();
  });

  it("does not roll a confirmed save back to an invalidated snapshot after refresh failure", () => {
    let state = editSettings(begin(), { type: "saved" });
    state = sync(state, base, false);
    expect(state.base.excludedApps).toEqual(["saved.exe"]);
    expect(state.draft.excludedApps).toBe("saved.exe");
    expect(isDirty(state.draft, state.base)).toBe(false);
  });

  it("reconciles a genuine later external update while retaining dirty input", () => {
    let state = editSettings(begin(), {
      type: "edit",
      patch: { excludedApps: "new.exe" },
    });
    state = editSettings(state, { type: "saved" });
    state = sync(state, { ...state.base, retentionDays: 90 });
    expect(state.base.retentionDays).toBe(90);
    expect(state.draft.excludedApps).toBe("new.exe");
    expect(state.external).toBe(true);
  });
});

describe("history read recovery", () => {
  it("shows the failed requested date, cached date and retry after a date switch", async () => {
    const store = new SnapshotStore(async (s) => {
      if (s === bounds("2026-10-07")[0]) throw new Error("IPC unavailable");
      return workspace([]);
    });
    await store.fetch(...bounds("2026-10-08"));
    await store.fetch(...bounds("2026-10-07")).catch(() => {});
    const view = resolveView(
      store.get(...bounds("2026-10-07")),
      store.get(...bounds("2026-10-08")),
      store.version,
    );
    const html = renderToStaticMarkup(
      <RangeNotice date="2026-10-07" view={{ ...view, retry: () => {} }} />,
    );
    expect(html).toContain("读取失败");
    expect(html).toContain("10月7日");
    expect(html).toContain("10月8日");
    expect(html).toContain("IPC unavailable");
    expect(html).toContain("重试");
    expect(html).not.toContain("正在读取");
  });

  it("disables retry while the failed date is being read and clears the notice on success", async () => {
    const pending = deferred<Snapshot>();
    let hold = false;
    const store = new SnapshotStore(async (s) => {
      if (s === bounds("2026-10-07")[0]) {
        if (hold) return pending.promise;
        throw new Error("IPC unavailable");
      }
      return workspace([]);
    });
    await store.fetch(...bounds("2026-10-08"));
    await store.fetch(...bounds("2026-10-07")).catch(() => {});
    hold = true;
    const retry = store.fetch(...bounds("2026-10-07"));
    const render = () =>
      renderToStaticMarkup(
        <RangeNotice
          date="2026-10-07"
          view={{
            ...resolveView(
              store.get(...bounds("2026-10-07")),
              store.get(...bounds("2026-10-08")),
              store.version,
            ),
            retry: () => {},
          }}
        />,
      );
    expect(render()).toContain("正在重试");
    expect(render()).toContain('disabled=""');
    pending.resolve(workspace([]));
    await retry;
    expect(render()).toBe("");
  });
});

describe("cached report eligibility", () => {
  const date = "2026-10-08";
  const report = (store: SnapshotStore, kind: "day" | "week" = "day") =>
    assembleReport(kind, date, (s, e) => store.get(s, e), false, store.version);

  it.each(["day", "week"] as const)(
    "keeps a %s preview but blocks export on a cached read failure and throughout retry",
    async (kind) => {
      let fail = false;
      let hold: ReturnType<typeof deferred<Snapshot>> | null = null;
      const store = new SnapshotStore(async (s) => {
        if (s === bounds(date)[0]) {
          if (hold) return hold.promise;
          if (fail) throw new Error("IPC unavailable");
        }
        return workspace([]);
      });
      for (const d of kind === "week" ? weekDates(date) : [date])
        await store.fetch(...bounds(d));
      expect(report(store, kind).status).toBe("ready");
      fail = true;
      await store.fetch(...bounds(date)).catch(() => {});
      const stale = report(store, kind);
      expect(stale.status).toBe("stale");
      expect("model" in stale).toBe(true);
      if (stale.status === "stale") expect(stale.failedDates).toEqual([date]);
      hold = deferred<Snapshot>();
      const retry = store.fetch(...bounds(date));
      expect(report(store, kind).status).toBe("stale");
      hold.resolve(workspace([]));
      await retry;
      expect(report(store, kind).status).toBe("ready");
    },
  );

  it("waits for every invalidated day even if today's poll already succeeded", async () => {
    const store = new SnapshotStore(async () => workspace([]));
    const dates = weekDates(date);
    for (const d of dates) await store.fetch(...bounds(d));
    store.invalidate();
    await store.fetch(...bounds(date));
    const state = report(store, "week");
    expect(state.status).toBe("stale");
    if (state.status === "stale")
      expect(state.invalidatedDates).toEqual(dates.slice(0, -1));
    for (const d of dates.slice(0, -1)) await store.fetch(...bounds(d));
    expect(report(store, "week").status).toBe("ready");
  });

  it("keeps export available during an ordinary poll with valid cached data", async () => {
    const pending = deferred<Snapshot>();
    let hold = false;
    const store = new SnapshotStore(() =>
      hold ? pending.promise : Promise.resolve(workspace([])),
    );
    await store.fetch(...bounds(date));
    hold = true;
    const poll = store.fetch(...bounds(date));
    const state = report(store);
    expect(state.status).toBe("ready");
    if (state.status === "ready") expect(state.refreshing).toBe(true);
    pending.resolve(workspace([]));
    await poll;
  });
});
