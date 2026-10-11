import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  executeMutation,
  PendingRegistry,
  type MutationOutcome,
} from "./mutations";
import { NoticeStore } from "./notices";
import { startPolling } from "./poller";
import {
  rangeKey,
  resolveView,
  SnapshotStore,
  type RangeView,
} from "./snapshot-store";

interface DataContext {
  store: SnapshotStore;
  pending: PendingRegistry;
  notices: NoticeStore;
  /** Ranges currently on screen, refreshed right after a write. */
  displayed: Map<string, { start: number; end: number; count: number }>;
}

const Ctx = createContext<DataContext | null>(null);

export function DataProvider({
  store,
  children,
}: {
  store: SnapshotStore;
  children: ReactNode;
}) {
  const value = useMemo<DataContext>(
    () => ({
      store,
      pending: new PendingRegistry(),
      notices: new NoticeStore(),
      displayed: new Map(),
    }),
    [store],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useData(): DataContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("DataProvider missing");
  return c;
}

export function useNotices() {
  const { notices } = useData();
  const list = useSyncExternalStore(notices.subscribe, notices.getList);
  return { list, notices };
}

export function usePending(key: string): boolean {
  const { pending } = useData();
  useSyncExternalStore(pending.subscribe, pending.getTick);
  return pending.has(key);
}

/** Re-renders when any pending flag changes; use `isPending(key)` inside lists. */
export function usePendingSet(): (key: string) => boolean {
  const { pending } = useData();
  useSyncExternalStore(pending.subscribe, pending.getTick);
  return (key: string) => pending.has(key);
}

function useDisplayed(start: number, end: number, enabled: boolean) {
  const { displayed } = useData();
  useEffect(() => {
    if (!enabled) return;
    const key = rangeKey(start, end);
    const item = displayed.get(key) ?? { start, end, count: 0 };
    item.count++;
    displayed.set(key, item);
    return () => {
      item.count--;
      if (item.count <= 0) displayed.delete(key);
    };
  }, [displayed, start, end, enabled]);
}

export interface RangeOptions {
  /** Poll interval while visible; `null` fetches on demand and after writes only. */
  poll?: number | null;
  /** Interval while the document is hidden (tray / minimised). */
  hiddenPoll?: number;
  enabled?: boolean;
}

export interface RangeResult extends RangeView {
  retry: () => void;
}

/**
 * Data for one query range. Responses are bound to their range by the store,
 * so switching dates never shows old numbers as the new date: until the new
 * range loads, the previous range's data is returned flagged `transitional`.
 */
export function useRange(
  start: number,
  end: number,
  options: RangeOptions = {},
): RangeResult {
  const { store } = useData();
  const { poll = null, hiddenPoll = 15_000, enabled = true } = options;
  useSyncExternalStore(store.subscribe, store.getTick);
  useDisplayed(start, end, enabled);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || poll == null) return;
    const poller = startPolling(
      () => store.fetch(start, end),
      () => (document.visibilityState === "hidden" ? hiddenPoll : poll),
    );
    // Returning to a visible window refreshes at once instead of waiting a cycle.
    const onVisible = () => {
      if (document.visibilityState === "visible") poller.kick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      poller.stop();
    };
  }, [store, start, end, poll, hiddenPoll, enabled]);

  const wanted = store.get(start, end);
  const stale = !store.isFresh(wanted);
  useEffect(() => {
    if (enabled && poll == null && stale) store.ensure(start, end);
  });

  const previous = shown.current
    ? store.get(...(shown.current.split(":").map(Number) as [number, number]))
    : undefined;
  const view = resolveView(wanted, previous, store.version);
  if (wanted?.data) shown.current = wanted.key;
  const retry = useCallback(() => {
    void store.fetch(start, end).catch(() => undefined);
  }, [store, start, end]);
  return { ...view, retry };
}

/** Reads several ranges without polling (e.g. the seven days of a week). */
export function useRanges(ranges: [number, number][], enabled = true) {
  const { store, displayed } = useData();
  useSyncExternalStore(store.subscribe, store.getTick);
  const key = ranges.map(([s, e]) => rangeKey(s, e)).join("|");
  useEffect(() => {
    if (!enabled) return;
    const items = key.split("|").map((k) => {
      const [s, e] = k.split(":").map(Number);
      const item = displayed.get(k) ?? { start: s, end: e, count: 0 };
      item.count++;
      displayed.set(k, item);
      return [k, item] as const;
    });
    return () => {
      for (const [k, item] of items) {
        item.count--;
        if (item.count <= 0) displayed.delete(k);
      }
    };
  }, [displayed, key, enabled]);
  useEffect(() => {
    if (!enabled) return;
    for (const [s, e] of ranges) store.ensure(s, e);
  });
  return {
    version: store.version,
    entries: ranges.map(([s, e]) => store.get(s, e)),
    get: (s: number, e: number) => store.get(s, e),
    retry: () => {
      for (const [s, e] of ranges)
        void store.fetch(s, e).catch(() => undefined);
    },
  };
}

export type RunResult<T> = MutationOutcome<T> | { status: "busy" };

export interface RunOptions {
  /** Message after a confirmed write + refresh. */
  success?: string;
  /** When true the caller shows write errors inline (forms); otherwise a notice is raised. */
  inlineError?: boolean;
}

/**
 * Write helper with per-operation pending keys. A successful write followed by a
 * failed refresh reports "saved, display not updated" with a retry that only
 * re-reads — it never repeats the write.
 */
export function useMutate() {
  const { store, pending, notices, displayed } = useData();
  const refreshDisplayed = useCallback(async () => {
    const ranges = [...displayed.values()];
    await Promise.all(ranges.map((r) => store.fetch(r.start, r.end)));
  }, [store, displayed]);

  return useCallback(
    async <T,>(
      key: string,
      write: () => Promise<T>,
      opts: RunOptions = {},
    ): Promise<RunResult<T>> => {
      if (!pending.begin(key)) return { status: "busy" };
      try {
        const outcome = await executeMutation(write, async () => {
          store.invalidate();
          await refreshDisplayed();
        });
        if (outcome.status === "saved") {
          if (opts.success) notices.push("success", opts.success);
        } else if (outcome.status === "saved-refresh-failed") {
          notices.push(
            "warning",
            `${opts.success ?? "已保存"}，但界面数据刷新失败：${outcome.error}`,
            {
              label: "重新读取",
              run: () => refreshDisplayed().catch(() => undefined),
            },
          );
        } else {
          if (!opts.inlineError) notices.push("error", outcome.error);
          // Re-read so the screen reflects whatever the backend actually holds.
          store.invalidate();
          void refreshDisplayed().catch(() => undefined);
        }
        return outcome;
      } finally {
        pending.end(key);
      }
    },
    [store, pending, notices, refreshDisplayed],
  );
}
