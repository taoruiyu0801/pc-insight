export interface Span {
  start: number;
  end: number;
}

export type View = Span;

const HOUR = 3_600_000;
const MINUTE = 60_000;
/** Smallest zoom window: 2 minutes is enough to separate individual 2-second samples. */
export const MIN_SPAN = 2 * MINUTE;

/** Data extent rounded out to whole hours. Loops instead of `Math.min(...arr)` so 5,000+ items are safe. */
export function dataRange(spans: Iterable<Span>): View | null {
  let min = Infinity;
  let max = -Infinity;
  for (const s of spans) {
    if (s.start < min) min = s.start;
    if (s.end > max) max = s.end;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const start = Math.floor(min / HOUR) * HOUR;
  const end = Math.max(start + HOUR, Math.ceil(max / HOUR) * HOUR);
  return { start, end };
}

export function clampView(v: View, full: View): View {
  const fullSpan = full.end - full.start;
  const span = Math.min(
    fullSpan,
    Math.max(Math.min(MIN_SPAN, fullSpan), v.end - v.start),
  );
  let start = Math.max(full.start, Math.min(v.start, full.end - span));
  if (!Number.isFinite(start)) start = full.start;
  return { start, end: start + span };
}

/** factor < 1 zooms in. The anchor time stays under the same screen position. */
export function zoomView(
  v: View,
  factor: number,
  anchor: number,
  full: View,
): View {
  const span = v.end - v.start;
  const next = span * factor;
  const ratio = span > 0 ? (anchor - v.start) / span : 0.5;
  return clampView(
    { start: anchor - next * ratio, end: anchor - next * ratio + next },
    full,
  );
}

export function panView(v: View, fraction: number, full: View): View {
  const delta = (v.end - v.start) * fraction;
  return clampView({ start: v.start + delta, end: v.end + delta }, full);
}

export function centerOn(v: View, span: Span, full: View): View {
  if (span.start >= v.start && span.end <= v.end) return v;
  const width = v.end - v.start;
  const mid = (span.start + span.end) / 2;
  return clampView({ start: mid - width / 2, end: mid + width / 2 }, full);
}

/** Zooms to a span with a little margin on each side. */
export function fitSpan(span: Span, full: View): View {
  const pad = Math.max(MINUTE, (span.end - span.start) * 0.08);
  return clampView({ start: span.start - pad, end: span.end + pad }, full);
}

const tickSteps = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360].map(
  (m) => m * MINUTE,
);
const minorFor: Record<number, number> = {
  [2 * MINUTE]: MINUTE,
  [5 * MINUTE]: MINUTE,
  [10 * MINUTE]: 2 * MINUTE,
  [15 * MINUTE]: 5 * MINUTE,
  [30 * MINUTE]: 10 * MINUTE,
  [60 * MINUTE]: 15 * MINUTE,
  [120 * MINUTE]: 30 * MINUTE,
  [180 * MINUTE]: 60 * MINUTE,
  [240 * MINUTE]: 60 * MINUTE,
  [360 * MINUTE]: 60 * MINUTE,
};

/** Major/minor ticks aligned to local clock time (e.g. 09:00, 09:15), not to the view edge. */
export function ticks(
  v: View,
  maxMajors = 8,
): { step: number; majors: number[]; minors: number[] } {
  const span = v.end - v.start;
  const step =
    tickSteps.find((s) => span / s <= maxMajors) ??
    tickSteps[tickSteps.length - 1];
  const midnight = new Date(v.start);
  midnight.setHours(0, 0, 0, 0);
  const base = midnight.getTime();
  const at = (s: number) => {
    const out: number[] = [];
    for (let t = base + Math.ceil((v.start - base) / s) * s; t <= v.end; t += s)
      out.push(t);
    return out;
  };
  const majors = at(step);
  const minorStep = minorFor[step];
  const majorSet = new Set(majors);
  const minors = minorStep ? at(minorStep).filter((t) => !majorSet.has(t)) : [];
  return { step, majors, minors };
}

/** Greedy row packing for overlapping items (supporting windows, background jobs). */
export function pack<T extends Span>(items: T[]): { item: T; row: number }[] {
  const ends: number[] = [];
  return items
    .slice()
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .map((item) => {
      let row = ends.findIndex((e) => e <= item.start);
      if (row < 0) row = ends.length;
      ends[row] = item.end;
      return { item, row };
    });
}

export interface DisplaySeg<T> {
  start: number;
  end: number;
  /** "mixed" when several sub-pixel items of different tones share the bar. */
  tone: string;
  row: number;
  items: T[];
  /** Every member is narrower than the merge threshold. */
  dense: boolean;
}

/**
 * Visual segments for the current view. Each segment is drawn at its true time
 * extent — nothing is widened. Two kinds of merging keep 5,000-item days cheap:
 * - neighbours with the same tone, when either is narrower than `mergeBelowPx`;
 * - a run of contiguous sub-pixel items with different tones, which becomes one
 *   "mixed" bar (drawn as dense, inspect by zooming) spanning exactly their union.
 * Merging only happens within the same row.
 */
export function displaySegments<T extends Span>(
  items: T[],
  view: View,
  widthPx: number,
  toneOf: (item: T) => string,
  mergeBelowPx = 2,
  rowOf: (item: T) => number = () => 0,
): DisplaySeg<T>[] {
  const msPerPx = (view.end - view.start) / Math.max(1, widthPx);
  const out: DisplaySeg<T>[] = [];
  const lastByRow = new Map<number, DisplaySeg<T>>();
  for (const item of items) {
    if (item.end <= view.start || item.start >= view.end) continue;
    const tone = toneOf(item);
    const row = rowOf(item);
    const narrow = (item.end - item.start) / msPerPx < mergeBelowPx;
    const last = lastByRow.get(row);
    if (last && item.start - last.end < msPerPx) {
      const lastNarrow = (last.end - last.start) / msPerPx < mergeBelowPx;
      if (
        (last.tone === tone && (narrow || lastNarrow)) ||
        (narrow && last.dense)
      ) {
        last.end = Math.max(last.end, item.end);
        last.items.push(item);
        if (last.tone !== tone) last.tone = "mixed";
        last.dense = last.dense && narrow;
        continue;
      }
    }
    const seg = {
      start: item.start,
      end: item.end,
      tone,
      row,
      items: [item],
      dense: narrow,
    };
    out.push(seg);
    lastByRow.set(row, seg);
  }
  return out;
}

/**
 * Items under a pointer at time `t`. Items containing `t` come first, then items
 * within `tolMs` by distance, then shorter first. More than one result means the
 * UI should let the user choose rather than silently picking the top one.
 */
export function candidatesAt<T extends Span>(
  items: T[],
  t: number,
  tolMs: number,
): T[] {
  const dist = (s: T) =>
    t < s.start ? s.start - t : t > s.end ? t - s.end : 0;
  return items
    .filter((s) => dist(s) <= tolMs)
    .sort((a, b) => dist(a) - dist(b) || a.end - a.start - (b.end - b.start));
}

/** Percent position within the view (can be outside 0–100 for partially visible items). */
export function place(span: Span, view: View): { left: string; width: string } {
  const total = view.end - view.start;
  const s = Math.max(span.start, view.start);
  const e = Math.min(span.end, view.end);
  return {
    left: `${((s - view.start) / total) * 100}%`,
    width: `${(Math.max(0, e - s) / total) * 100}%`,
  };
}
