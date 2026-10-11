import type { Snapshot } from "../../../../packages/types";
import { ago } from "./format";

export type LiveKind =
  "paused" | "break" | "waiting" | "stale" | "live" | "error";

export interface LiveStatus {
  kind: LiveKind;
  label: string;
  detail: string;
  /** A source warning that does not change the kind (e.g. an error while samples still arrive). */
  warning: string | null;
}

type LiveFields = Pick<
  Snapshot,
  | "recording"
  | "breaking"
  | "lastSample"
  | "error"
  | "currentApp"
  | "collectorSource"
> & { settings: Pick<Snapshot["settings"], "sampleSeconds"> };

/**
 * How old the last sample may be before we call it "stale". The runtime samples
 * every `sampleSeconds` (1–5 s); allowing several missed cycles plus a floor
 * avoids flagging normal jitter or a slow ActivityWatch poll as a fault.
 */
export function staleAfterMs(sampleSeconds: number): number {
  return Math.max(15_000, sampleSeconds * 1000 * 6);
}

/**
 * Distinguishes "the user allowed recording" from "samples are actually arriving".
 * `recording === true` alone never means collection is healthy.
 */
export function liveStatus(s: LiveFields, nowMs: number): LiveStatus {
  if (!s.recording)
    return {
      kind: "paused",
      label: "记录已暂停",
      detail: "不会写入新的活动",
      warning: null,
    };
  if (s.breaking)
    return {
      kind: "break",
      label: "休息中",
      detail: "这段时间记为离开 / 休息",
      warning: null,
    };
  const age = s.lastSample == null ? null : nowMs - s.lastSample;
  const stale = age != null && age > staleAfterMs(s.settings.sampleSeconds);
  if (s.error && (age == null || stale))
    return {
      kind: "error",
      label: "采集来源异常",
      detail: s.error,
      warning: null,
    };
  if (age == null)
    return {
      kind: "waiting",
      label: "等待第一条采样",
      detail: `来源：${s.collectorSource}`,
      warning: null,
    };
  if (stale)
    return {
      kind: "stale",
      label: "采样已停滞",
      detail: `最后采样于 ${ago(age)}`,
      warning: null,
    };
  return {
    kind: "live",
    label: "正在记录",
    detail: s.currentApp
      ? `此刻：${s.currentApp}`
      : `来源：${s.collectorSource}`,
    warning: s.error,
  };
}
