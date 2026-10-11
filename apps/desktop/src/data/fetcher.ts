import { api } from "../api";
import type { Fetcher } from "./snapshot-store";

// The only snapshot reader used by the UI. Explicit dev fixtures (see dev/setup.ts,
// development builds in the browser only) may wrap it to inject delays or faults.
let current: Fetcher = (start, end) => api.snapshot(start, end);

export const getFetcher = (): Fetcher => current;

export function setFetcher(f: Fetcher) {
  current = f;
}
