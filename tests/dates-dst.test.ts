import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bounds,
  shiftDate,
  weekDates,
  isDateKey,
} from "../apps/desktop/src/lib/dates";

// Runs in a DST zone so local-day boundaries are exercised for real (the default
// zone on this machine has no DST). Vitest runs each file in its own process.
const original = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = original;
});

const hours = (d: string) => (bounds(d)[1] - bounds(d)[0]) / 3_600_000;

describe("10 · local calendar days", () => {
  it("is really running in a DST time zone", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      "America/New_York",
    );
  });
  it("has 23- and 25-hour days at DST transitions", () => {
    expect(hours("2026-03-08")).toBe(23);
    expect(hours("2026-11-01")).toBe(25);
    expect(hours("2026-10-08")).toBe(24);
  });
  it("shifts across month, year and leap-day boundaries", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDate("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftDate("2026-11-01", 1)).toBe("2026-11-02");
  });
  it("builds a contiguous week across a DST change", () => {
    const week = weekDates("2026-03-10");
    expect(week).toEqual([
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
    for (let i = 1; i < week.length; i++)
      expect(bounds(week[i])[0]).toBe(bounds(week[i - 1])[1]);
  });
  it("validates date keys", () => {
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
  });
});
