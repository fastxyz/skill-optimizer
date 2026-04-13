// src/counter.ts

/** Creates a new counter, optionally starting at a given value. */
export function createCounter(options?: { start?: number }): Counter {
  return new Counter(options?.start ?? 0);
}

export class Counter {
  #value: number;
  constructor(start: number) { this.#value = start; }

  /** Advances the counter and returns the new value. */
  increment(amount?: number): number {
    this.#value += amount ?? 1;
    return this.#value;
  }

  /** Resets the counter to 0 (or the given value). */
  reset(to?: number): number {
    this.#value = to ?? 0;
    return this.#value;
  }

  value(): number { return this.#value; }
}
