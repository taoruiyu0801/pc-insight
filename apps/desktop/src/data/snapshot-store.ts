import type { Snapshot } from "../../../../packages/types";
import { now as clock } from "../lib/clock";

export type Fetcher = (start: number, end: number) => Promise<Snapshot>;

export interface Entry {
  key: string;
  start: number;
  end: number;
  /** Last successful result for exactly this range. Never data from another range. */
  data: Snapshot | null;
  /** Error of the most recent attempt; cleared by the next success. */
  error: string | null;
  updatedAt: number | null;
  /** Store version the held data was requested at. Lower than `store.version` means stale. */
  version: number;
  /** Store version of the most recent attempt, successful or not. */
  attempted: number;
  fetching: boolean;
}

export const rangeKey = (start: number, end: number) => `${start}:${end}`;

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : String(e);
}

/**
 * Snapshot cache keyed by query range.
 *
 * - Results are stored under the key they were requested for, so a slow response
 *   for an old date can never be shown under a newer date.
 * - Concurrent requests for the same key and version share one promise.
 * - `invalidate()` bumps the version after writes; anything older is stale and
 *   refetched by whoever is displaying it. No toast or page change drives refreshes.
 * - Tauri IPC cannot be cancelled; superseded responses are simply ignored.
 */
export class SnapshotStore {
  version = 0;
  private entries = new Map<string, Entry>();
  private inflight = new Map<
    string,
    { version: number; promise: Promise<Snapshot> }
  >();
  private seq = new Map<string, { started: number; applied: number }>();
  private listeners = new Set<() => void>();
  private tick = 0;

  constructor(
    private fetcher: Fetcher,
    private nowFn: () => number = clock,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getTick = () => this.tick;

  private notify() {
    this.tick++;
    for (const fn of [...this.listeners]) fn();
  }

  get(start: number, end: number): Entry | undefined {
    return this.entries.get(rangeKey(start, end));
  }

  isFresh(entry: Entry | undefined): boolean {
    return !!entry?.data && entry.version >= this.version;
  }

  inflightCount(): number {
    return this.inflight.size;
  }

  fetch(start: number, end: number): Promise<Snapshot> {
    const key = rangeKey(start, end);
    const running = this.inflight.get(key);
    if (running && running.version === this.version) return running.promise;
    const version = this.version;
    const seq = this.seq.get(key) ?? { started: 0, applied: 0 };
    const mine = ++seq.started;
    this.seq.set(key, seq);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        key,
        start,
        end,
        data: null,
        error: null,
        updatedAt: null,
        version: -1,
        attempted: -1,
        fetching: true,
      };
      this.entries.set(key, entry);
    }
    entry.fetching = true;
    entry.attempted = version;
    const promise = this.fetcher(start, end).then(
      (data) => {
        const e = this.entries.get(key)!;
        // A request started later may already have answered; keep the newer one.
        if (mine > seq.applied) {
          seq.applied = mine;
          e.data = data;
          e.error = null;
          e.updatedAt = this.nowFn();
          e.version = version;
        }
        this.prune();
        return data;
      },
      (err) => {
        const e = this.entries.get(key)!;
        if (mine > seq.applied) e.error = errorText(err);
        throw err;
      },
    );
    const record = { version, promise };
    this.inflight.set(key, record);
    const settle = () => {
      if (this.inflight.get(key) === record) this.inflight.delete(key);
      const e = this.entries.get(key);
      if (e) e.fetching = this.inflight.has(key);
      this.notify();
    };
    promise.then(settle, settle);
    this.notify();
    return promise;
  }

  /**
   * Fetches only if missing or stale — for passively displayed ranges. A range
   * that already failed at the current version is not retried automatically
   * (no tight error loop); the UI offers an explicit retry.
   */
  ensure(start: number, end: number): Promise<void> | null {
    const entry = this.get(start, end);
    if (entry?.fetching) return null;
    if (this.isFresh(entry)) return null;
    if (entry && entry.attempted >= this.version) return null;
    // The error is kept on the entry; callers read it from there.
    return this.fetch(start, end).then(
      () => undefined,
      () => undefined,
    );
  }

  /** Bounds memory when browsing many dates: drops the least recently loaded ranges. */
  private prune(max = 48) {
    if (this.entries.size <= max) return;
    const idle = [...this.entries.values()]
      .filter((e) => !e.fetching)
      .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
    for (const e of idle.slice(0, this.entries.size - max + 8)) {
      this.entries.delete(e.key);
      this.seq.delete(e.key);
    }
  }

  /** Marks every cached range stale (after a successful write). */
  invalidate() {
    this.version++;
    this.notify();
  }
}

export interface RangeView {
  /** Data to display, possibly from `shownKey` while `wantedKey` is loading. */
  data: Snapshot | null;
  shownKey: string | null;
  /** True when `data` belongs to a different range than the one asked for. */
  transitional: boolean;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  stale: boolean;
}

/**
 * Picks what to show for `wantedKey`. While the new range has no data yet, the
 * previously shown range may stay on screen, but flagged as transitional so the
 * UI labels it with its own range instead of the new date.
 */
export function resolveView(
  wanted: Entry | undefined,
  previous: Entry | undefined,
  storeVersion: number,
): RangeView {
  if (wanted?.data)
    return {
      data: wanted.data,
      shownKey: wanted.key,
      transitional: false,
      loading: wanted.fetching,
      error: wanted.error,
      updatedAt: wanted.updatedAt,
      stale: wanted.version < storeVersion,
    };
  return {
    data: previous?.data ?? null,
    shownKey: previous?.data ? previous.key : null,
    transitional: !!previous?.data,
    loading: wanted?.fetching ?? true,
    error: wanted?.error ?? null,
    updatedAt: previous?.updatedAt ?? null,
    stale: true,
  };
}
