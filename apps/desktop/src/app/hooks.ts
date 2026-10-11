import { useEffect, useMemo, useState } from "react";
import type { Project } from "../../../../packages/types";
import { now } from "../lib/clock";
import { bounds, localDate } from "../lib/dates";
import { useRange } from "../data/context";

/** Today's date, re-checked every 30 s so the app rolls over at midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => localDate());
  useEffect(() => {
    const t = setInterval(() => setToday(localDate()), 30_000);
    return () => clearInterval(t);
  }, []);
  return today;
}

/** Ticking clock for freshness labels and running timers. */
export function useNow(intervalMs = 1000): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setT(now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return t;
}

export const LIVE_POLL_MS = 2_000;

/**
 * Today's snapshot, polled sequentially. It is the single source of the live
 * state (recording, break, intent, last sample) used by every control.
 */
export function useLive(today: string, poll: number = LIVE_POLL_MS) {
  const [start, end] = bounds(today);
  return useRange(start, end, { poll });
}

export function useDay(date: string) {
  const [start, end] = bounds(date);
  return useRange(start, end);
}

export function useProjectIndex(projects: Project[] | undefined) {
  return useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p])),
    [projects],
  );
}
