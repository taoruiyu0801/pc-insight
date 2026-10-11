// Single source of "now" for the interface. Tests and explicit dev fixtures can
// freeze it so screenshots and date-boundary checks are reproducible.
let frozen: number | null = null;

export const now = (): number => frozen ?? Date.now();

export function freezeClock(ms: number | null): void {
  frozen = ms;
}
