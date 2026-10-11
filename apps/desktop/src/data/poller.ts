export interface Poller {
  stop(): void;
  /** Run as soon as the current request (if any) finishes. */
  kick(): void;
}

/**
 * Sequential polling: the next request is scheduled only after the previous one
 * settles. Slow responses therefore never pile up, and every response is applied
 * (unlike a fixed `setInterval` whose newer requests keep superseding older ones).
 */
export function startPolling(
  task: () => Promise<unknown>,
  interval: () => number,
): Poller {
  let stopped = false;
  let running = false;
  let kicked = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    if (stopped) return;
    timer = undefined;
    running = true;
    kicked = false;
    try {
      await task();
    } catch {
      // Errors are recorded by the task's owner; polling continues.
    } finally {
      running = false;
    }
    if (stopped) return;
    timer = setTimeout(run, kicked ? 0 : interval());
  };

  void run();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    kick() {
      if (stopped) return;
      if (running) {
        kicked = true;
        return;
      }
      if (timer) clearTimeout(timer);
      void run();
    },
  };
}
