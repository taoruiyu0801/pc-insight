import { describe, expect, it } from "vitest";
import { liveStatus, staleAfterMs } from "../apps/desktop/src/lib/status";
import {
  categoryLabel,
  jobStatusInfo,
  sourceLabel,
  stateInfo,
} from "../apps/desktop/src/lib/semantics";
import { durationParts, duration } from "../apps/desktop/src/lib/format";
import { parseList } from "../apps/desktop/src/lib/lists";
import {
  validateProject,
  validateRule,
} from "../apps/desktop/src/lib/validation";
import {
  draftErrors,
  fromDraft,
  isDirty,
  rebase,
  toDraft,
} from "../apps/desktop/src/features/settings/draft";
import { demo } from "../apps/desktop/src/demo";
import {
  candidatesAt,
  clampView,
  dataRange,
  displaySegments,
  pack,
  ticks,
  zoomView,
} from "../apps/desktop/src/features/timeline/layout";
import { buildReport } from "../apps/desktop/src/features/reports/report-model";
import { demoSnapshot } from "../apps/desktop/src/demo";
import { bounds } from "../apps/desktop/src/lib/dates";
import { workspace } from "./helpers";

const live = {
  recording: true,
  breaking: false,
  lastSample: 1_000_000,
  error: null,
  currentApp: "Code.exe",
  collectorSource: "Windows 原生",
  settings: { sampleSeconds: 2 },
};

describe("8 · recording vs. actually sampling", () => {
  it("separates paused, break, waiting, stale, error and live", () => {
    expect(liveStatus({ ...live, recording: false }, 1_000_000).kind).toBe(
      "paused",
    );
    expect(liveStatus({ ...live, breaking: true }, 1_000_000).kind).toBe(
      "break",
    );
    expect(liveStatus({ ...live, lastSample: null }, 1_000_000).kind).toBe(
      "waiting",
    );
    expect(liveStatus(live, 1_000_000 + 5_000).kind).toBe("live");
    expect(liveStatus(live, 1_000_000 + staleAfterMs(2) + 1).kind).toBe(
      "stale",
    );
    expect(
      liveStatus({ ...live, error: "采集失败" }, 1_000_000 + 60_000).kind,
    ).toBe("error");
  });
  it("keeps a recent sample live and surfaces a source error as a warning", () => {
    const s = liveStatus({ ...live, error: "AW 不可用" }, 1_000_000 + 2_000);
    expect(s.kind).toBe("live");
    expect(s.warning).toBe("AW 不可用");
  });
  it("a paused recorder is never reported as a fault", () => {
    expect(
      liveStatus({ ...live, recording: false, lastSample: 0 }, 9e12).kind,
    ).toBe("paused");
  });
});

describe("9 · zero, empty, long text, unknown values", () => {
  it("falls back for unknown states, statuses, sources and categories", () => {
    expect(stateInfo("hyperfocus").known).toBe(false);
    expect(stateInfo("hyperfocus").label).toContain("hyperfocus");
    expect(stateInfo("").label).toContain("空");
    expect(jobStatusInfo("paused").label).toContain("paused");
    expect(jobStatusInfo("paused").running).toBe(false);
    expect(sourceLabel("browser")).toContain("browser");
    expect(categoryLabel("gaming")).toContain("gaming");
    expect(stateInfo("focused", true).key).toBe("idle");
  });
  it("formats zero and sub-minute durations without lying", () => {
    expect(duration(0)).toBe("0 分钟");
    expect(duration(12_000)).toBe("< 1 分钟");
    expect(duration(12_000, true)).toBe("12 秒");
    expect(duration(95_000, true)).toBe("1 分 35 秒");
    expect(durationParts(0)).toEqual([{ value: "0", unit: "分钟" }]);
    expect(durationParts(30_000)).toEqual([{ value: "<1", unit: "分钟" }]);
    expect(durationParts(253 * 60_000)).toEqual([
      { value: "4", unit: "小时" },
      { value: "13", unit: "分" },
    ]);
  });
  it("builds a report for an empty day", () => {
    const m = buildReport(
      "day",
      [
        {
          date: "2026-10-08",
          snapshot: demoSnapshot(...bounds("2026-10-08"), workspace([])),
        },
      ],
      false,
    );
    expect(m.totals.activeMs).toBe(0);
    expect(m.observations[0]).toContain("没有电脑活动");
    expect(m.projects).toEqual([]);
  });
  it("parses Chinese/English commas and newlines, dropping blanks and duplicates", () => {
    expect(parseList("Cisco, CCNA，netacad\n\n cisco ,、SPAD")).toEqual([
      "Cisco",
      "CCNA",
      "netacad",
      "SPAD",
    ]);
    expect(parseList(" , ，\n")).toEqual([]);
  });
  it("validates project limits like the backend (bytes for keywords)", () => {
    const ok = {
      name: "论文",
      category: "research",
      color: "#9c4f38",
      keywords: "SPAD",
    };
    expect(validateProject(ok)).toEqual({});
    expect(validateProject({ ...ok, name: "  " }).name).toBeTruthy();
    expect(validateProject({ ...ok, name: "长".repeat(81) }).name).toBeTruthy();
    expect(
      validateProject({ ...ok, keywords: "词".repeat(67) }).keywords,
    ).toBeTruthy();
    expect(
      validateProject({ ...ok, keywords: "词".repeat(66) }).keywords,
    ).toBeUndefined();
    expect(
      validateProject({
        ...ok,
        keywords: Array.from({ length: 31 }, (_, i) => `k${i}`).join(","),
      }).keywords,
    ).toBeTruthy();
    expect(validateProject({ ...ok, color: "red" }).color).toBeTruthy();
    expect(
      validateRule({
        field: "title",
        pattern: "",
        category: "learning",
        relation: "related",
      }).pattern,
    ).toBeTruthy();
  });
});

describe("settings draft", () => {
  const saved = {
    ...demo.settings,
    excludedApps: ["password.exe"],
    browserToken: "secret-token",
  };
  it("is clean when unchanged and dirty after an edit", () => {
    const d = toDraft(saved);
    expect(isDirty(d, saved)).toBe(false);
    expect(isDirty({ ...d, idleSeconds: 300 }, saved)).toBe(true);
    expect(isDirty({ ...d, excludedApps: "password.exe\n" }, saved)).toBe(
      false,
    );
  });
  it("never takes the browser token from the draft and drops blank list items", () => {
    const out = fromDraft(
      { ...toDraft(saved), excludedTitles: "InPrivate,\n,无痕" },
      saved,
    );
    expect(out.browserToken).toBe("secret-token");
    expect(out.excludedTitles).toEqual(["InPrivate", "无痕"]);
  });
  it("keeps a dirty draft when the backend value changes underneath it", () => {
    const d = { ...toDraft(saved), idleSeconds: 600 };
    const next = { ...saved, retentionDays: 90 };
    const r = rebase(d, saved, next);
    expect(r.draft.idleSeconds).toBe(600);
    expect(r.externalChange).toBe(true);
    const clean = rebase(toDraft(saved), saved, next);
    expect(clean.draft.retentionDays).toBe(90);
  });
  it("flags out-of-range values and oversized lists", () => {
    const d = toDraft(saved);
    expect(draftErrors(d)).toEqual({});
    expect(draftErrors({ ...d, idleSeconds: 5 }).idleSeconds).toBeTruthy();
    expect(
      draftErrors({
        ...d,
        excludedApps: Array.from({ length: 101 }, (_, i) => `a${i}`).join("\n"),
      }).excludedApps,
    ).toBeTruthy();
  });
});

describe("timeline layout", () => {
  const H = 3_600_000;
  it("rounds the data range to hours without spreading huge arrays", () => {
    const many = Array.from({ length: 200_000 }, (_, i) => ({
      start: 10 * H + i,
      end: 10 * H + i + 1,
    }));
    expect(dataRange(many)).toEqual({ start: 10 * H, end: 11 * H });
    expect(dataRange([])).toBeNull();
  });
  it("keeps zoom inside bounds and never below the minimum span", () => {
    const full = { start: 0, end: 10 * H };
    const z = zoomView(full, 0.000001, 5 * H, full);
    expect(z.end - z.start).toBe(2 * 60_000);
    expect(clampView({ start: -H, end: H }, full).start).toBe(0);
  });
  it("aligns ticks to local clock minutes", () => {
    const base = new Date(2026, 9, 8, 9, 7).getTime();
    const t = ticks({ start: base, end: base + 2 * H });
    for (const m of t.majors) expect(new Date(m).getMinutes() % 15).toBe(0);
  });
  it("draws short items at their true extent; merges only sub-pixel neighbours", () => {
    const items = [
      { start: 0, end: 10_000, s: "focused" },
      { start: 10_000, end: 20_000, s: "focused" },
      { start: 20_000, end: 3_600_000, s: "distracted" },
    ];
    const segs = displaySegments(
      items,
      { start: 0, end: 12 * H },
      1000,
      (i) => i.s,
    );
    expect(segs[0].start).toBe(0);
    expect(segs[0].end).toBe(20_000); // 20 s, not widened
    expect(segs[0].items).toHaveLength(2);
    expect(segs[1].start).toBe(20_000);
  });
  it("collapses runs of sub-pixel items with mixed states into one dense bar at their true extent", () => {
    const items = Array.from({ length: 300 }, (_, i) => ({
      start: i * 8_000,
      end: (i + 1) * 8_000,
      s: i % 3 ? "focused" : "distracted",
    }));
    const segs = displaySegments(
      items,
      { start: 0, end: 12 * H },
      1000,
      (i) => i.s,
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].tone).toBe("mixed");
    expect([segs[0].start, segs[0].end]).toEqual([0, 300 * 8_000]);
    // Zoomed in, the same items are drawn individually again.
    const zoomed = displaySegments(
      items,
      { start: 0, end: 10 * 60_000 },
      1000,
      (i) => i.s,
    );
    expect(zoomed.every((s) => s.tone !== "mixed")).toBe(true);
  });
  it("never merges items that sit in different rows", () => {
    const items = [
      { start: 0, end: 1000, r: 0 },
      { start: 1000, end: 2000, r: 1 },
    ];
    expect(
      displaySegments(
        items,
        { start: 0, end: H },
        1000,
        () => "x",
        2,
        (i) => i.r,
      ),
    ).toHaveLength(2);
  });
  it("offers a choice when several short items sit under the pointer", () => {
    const items = [
      { start: 1000, end: 2000 },
      { start: 2000, end: 2500 },
      { start: 9000, end: 9500 },
    ];
    const c = candidatesAt(items, 2000, 600);
    expect(c).toHaveLength(2);
    expect(c[0]).toBe(items[1]); // both contain t; the shorter one first
    expect(candidatesAt(items, 5000, 600)).toHaveLength(0);
  });
  it("packs overlapping jobs into separate rows", () => {
    const rows = pack([
      { start: 0, end: 10 },
      { start: 5, end: 15 },
      { start: 10, end: 20 },
    ]).map((r) => r.row);
    expect(rows).toEqual([0, 1, 0]);
  });
});
