import { errorText } from "./snapshot-store";

export type MutationOutcome<T = unknown> =
  | { status: "failed"; error: string }
  | { status: "saved"; value: T }
  | { status: "saved-refresh-failed"; value: T; error: string };

/**
 * Runs a write, then a refresh, and reports them separately. A refresh failure
 * after a successful write is *not* a failed save: callers must not invite the
 * user to resubmit (non-idempotent creates would duplicate). The write is never
 * retried here.
 */
export async function executeMutation<T>(
  write: () => Promise<T>,
  refresh: () => Promise<unknown>,
): Promise<MutationOutcome<T>> {
  let value: T;
  try {
    value = await write();
  } catch (e) {
    return { status: "failed", error: errorText(e) };
  }
  try {
    await refresh();
    return { status: "saved", value };
  } catch (e) {
    return { status: "saved-refresh-failed", value, error: errorText(e) };
  }
}

/** Per-operation pending flags, e.g. `recording`, `job:<id>`, `project:new`. */
export class PendingRegistry {
  private keys = new Set<string>();
  private listeners = new Set<() => void>();
  private tick = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getTick = () => this.tick;

  has(key: string) {
    return this.keys.has(key);
  }
  /** Returns false when the same operation is already running (double click). */
  begin(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    this.emit();
    return true;
  }
  end(key: string) {
    if (this.keys.delete(key)) this.emit();
  }
  private emit() {
    this.tick++;
    for (const fn of [...this.listeners]) fn();
  }
}
