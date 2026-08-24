export interface Clock {
  now(): Date;
}

export const realClock: Clock = {
  now: () => new Date(),
};

/**
 * A settable clock for tests and, later, daemon logic that needs to reason
 * about "a week from now" without actually waiting a week. Advance it
 * explicitly; it never moves on its own.
 */
export class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date = new Date("2026-08-24T00:00:00Z")) {
    this.current = start;
  }

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(date: Date): void {
    this.current = date;
  }
}
