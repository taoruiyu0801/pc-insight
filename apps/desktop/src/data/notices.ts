export type NoticeKind = "success" | "info" | "warning" | "error";

export interface Notice {
  id: number;
  kind: NoticeKind;
  text: string;
  action?: { label: string; run: () => void | Promise<unknown> };
}

/** Transient messages. Success/info dismiss themselves; warnings and errors stay until closed. */
export class NoticeStore {
  list: Notice[] = [];
  private seq = 0;
  private listeners = new Set<() => void>();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getList = () => this.list;

  push(kind: NoticeKind, text: string, action?: Notice["action"]): number {
    const id = ++this.seq;
    this.list = [
      ...this.list.filter((n) => n.text !== text),
      { id, kind, text, action },
    ].slice(-4);
    if (kind === "success" || kind === "info")
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), kind === "success" ? 3500 : 5000),
      );
    this.emit();
    return id;
  }

  dismiss(id: number) {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
    const next = this.list.filter((n) => n.id !== id);
    if (next.length !== this.list.length) {
      this.list = next;
      this.emit();
    }
  }

  private emit() {
    for (const fn of [...this.listeners]) fn();
  }
}
