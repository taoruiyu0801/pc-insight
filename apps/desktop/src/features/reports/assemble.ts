import type { Entry } from "../../data/snapshot-store";
import { bounds, weekDates } from "../../lib/dates";
import { buildReport, type ReportModel } from "./report-model";

export type ReportState =
  | { status: "ready"; model: ReportModel; refreshing: boolean }
  | {
      status: "stale";
      model: ReportModel;
      refreshing: boolean;
      failedDates: string[];
      invalidatedDates: string[];
      message: string | null;
    }
  | { status: "loading"; loaded: number; total: number }
  | { status: "error"; failedDates: string[]; message: string };

export function reportDates(kind: "day" | "week", endDate: string): string[] {
  return kind === "week" ? weekDates(endDate) : [endDate];
}

/**
 * Builds the report only from entries whose range is exactly each requested day.
 * Until every day has data for its own range, there is no model — so neither the
 * preview nor the export can show the previous date's numbers under a new title.
 */
export function assembleReport(
  kind: "day" | "week",
  endDate: string,
  getEntry: (start: number, end: number) => Entry | undefined,
  demo: boolean,
  storeVersion: number,
): ReportState {
  const dates = reportDates(kind, endDate);
  const entries = dates.map((date) => ({
    date,
    entry: getEntry(...bounds(date)),
  }));
  const failed = entries.filter(
    (e) => !e.entry?.data && e.entry?.error && !e.entry.fetching,
  );
  if (failed.length)
    return {
      status: "error",
      failedDates: failed.map((f) => f.date),
      message: failed[0].entry!.error!,
    };
  const loaded = entries.filter((e) => e.entry?.data).length;
  if (loaded < dates.length)
    return { status: "loading", loaded, total: dates.length };
  const model = buildReport(
    kind,
    entries.map((e) => ({ date: e.date, snapshot: e.entry!.data! })),
    demo,
  );
  const refreshing = entries.some((e) => e.entry!.fetching);
  // A retry retains its previous error until success. Ordinary polling alone
  // does not invalidate a report, but writes and failed reads block exporting it.
  const cachedFailures = entries.filter((e) => e.entry!.error);
  const invalidated = entries.filter((e) => e.entry!.version < storeVersion);
  if (cachedFailures.length || invalidated.length)
    return {
      status: "stale",
      model,
      refreshing,
      failedDates: cachedFailures.map((e) => e.date),
      invalidatedDates: invalidated.map((e) => e.date),
      message: cachedFailures[0]?.entry?.error ?? null,
    };
  return { status: "ready", model, refreshing };
}
