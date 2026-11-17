function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type CapacityLease = {
  readonly units: number;
  readonly release: () => void;
};

/** Render-attempt-local weighted capacity with explicit lease lifetime. */
export class WeightedCapacity {
  readonly #limit: number;
  #used = 0;
  #peak = 0;

  constructor(limit: number) {
    assert(Number.isSafeInteger(limit) && limit > 0, "Capacity limit must be a positive integer.");
    this.#limit = limit;
  }

  get used(): number { return this.#used; }
  get peak(): number { return this.#peak; }

  fits(units: number): boolean {
    this.#assertUnits(units);
    return this.#used + units <= this.#limit;
  }

  tryAcquire(units: number, allowOverflow = false): CapacityLease | undefined {
    this.#assertUnits(units);
    if (!allowOverflow && !this.fits(units)) return undefined;
    this.#used += units;
    this.#peak = Math.max(this.#peak, this.#used);
    let released = false;
    return {
      units,
      release: () => {
        if (released) return;
        released = true;
        assert(this.#used >= units, "Capacity lease underflowed.");
        this.#used -= units;
      },
    };
  }

  #assertUnits(units: number): void {
    assert(Number.isSafeInteger(units) && units > 0, "Capacity units must be a positive integer.");
    assert(Number.isSafeInteger(this.#used + units), "Capacity usage exceeds safe arithmetic.");
  }
}
