const DAY_MS = 86_400_000;

/**
 * The demo clock: real time shifted by an adjustable offset (Demo panel → "move today").
 * Every time-based rule (overdue instalments, document expiry, quote expiry, auto-travelled)
 * reads `now()` from here, never `Date.now()` directly.
 */
export class DemoClock {
  constructor(
    private offsetMs = 0,
    private readonly realNow: () => number = () => Date.now(),
  ) {}

  now(): number {
    return this.realNow() + this.offsetMs;
  }

  nowIso(): string {
    return new Date(this.now()).toISOString();
  }

  today(): string {
    return this.nowIso().slice(0, 10);
  }

  get offset(): number {
    return this.offsetMs;
  }

  setOffsetDays(days: number): void {
    this.offsetMs = Math.round(days * DAY_MS);
  }

  setOffsetMs(ms: number): void {
    this.offsetMs = ms;
  }

  get offsetDays(): number {
    return this.offsetMs / DAY_MS;
  }
}
