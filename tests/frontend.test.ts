import { describe, it, expect } from "vitest";
import {
  bounds,
  shiftDate,
  localDate,
  percent,
  report,
} from "../apps/desktop/src/format";
import { demoSnapshot } from "../apps/desktop/src/demo";
// @ts-expect-error Extension ships as plain JS, used by Chrome directly.
import { contextFor } from "../apps/browser-extension/context.js";

describe("date boundaries and exports", () => {
  it("advances calendar dates through month/year and leap-day boundaries", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(bounds("2026-10-08")[0]).toBe(new Date(2026, 9, 8).getTime());
  });
  it("does not add supporting and background time to computer time", () => {
    const data = demoSnapshot(...bounds(localDate()));
    expect(data.stats.activeMs).toBe(253 * 60_000);
    expect(data.stats.focusMs).toBe(248 * 60_000);
    expect(data.stats.parallelMs).toBeLessThanOrEqual(data.stats.activeMs);
    expect(data.stats.parallelMs).toBeLessThanOrEqual(data.stats.backgroundMs);
    expect(percent(0, 0)).toBe(0);
  });
  it("clearly marks demo reports and exports statistics instead of raw titles", () => {
    const data = demoSnapshot(...bounds(localDate()));
    const text = report(data, localDate(), "每日", true);
    expect(text).toContain("演示数据");
    expect(text).toContain("4 小时 13 分");
    expect(text).not.toContain("Switching concepts");
  });
});
describe("browser privacy boundary", () => {
  it("removes path, query, fragment, and credentials before sending", () => {
    const p = contextFor(
      {
        active: true,
        url: "https://user:secret@example.com/private?token=abc#secret",
        title: "Title",
      },
      true,
      "msedge.exe",
    );
    expect(p.url).toBe("https://example.com");
    expect(JSON.stringify(p)).not.toContain("secret");
  });
  it("never sends inactive, unfocused, private, or local-file tabs", () => {
    const tab = {
      active: true,
      url: "https://example.com/private",
      title: "Private",
    };
    for (const p of [
      contextFor({ ...tab, incognito: true }, true, "chrome.exe"),
      contextFor(tab, false, "chrome.exe"),
      contextFor({ ...tab, active: false }, true, "chrome.exe"),
      contextFor({ ...tab, url: "file:///C:/secret.pdf" }, true, "chrome.exe"),
    ]) {
      expect(p.active).toBe(false);
      expect(p.title).toBe("");
      expect(p.url).toBe("");
    }
  });
});
