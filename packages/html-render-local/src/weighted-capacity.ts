import { assert } from "./process.js";

export type CapacityLease = {
  readonly units: number;
  readonly release: () => void;
};

/** Attempt-local weighted capacity. It knows only integer units and lease lifetime. */
export class WeightedCapacity {
  readonly #limit: number;
  #used = 0;
  #peak = 0;

  constructor(limit: number) {
    assert(Number.isSafeInteger(limit) && limit > 0, "Capacity limit must be a positive integer");
    this.#limit = limit;
  }

  get limit(): number { return this.#limit; }
  get used(): number { return this.#used; }
  get peak(): number { return this.#peak; }

  fits(units: number): boolean {
    this.#assertUnits(units);
    return this.#used + units <= this.#limit;
  }

  tryAcquire(units: number, allowOverflow = false): CapacityLease | undefined {
    this.#assertUnits(units);
    if (!allowOverflow && !this.fits(units)) return undefined;
    return this.#lease(units);
  }

  #lease(units: number): CapacityLease {
    this.#used += units;
    this.#peak = Math.max(this.#peak, this.#used);
    let released = false;
    return { units, release: () => {
      if (released) return;
      released = true;
      assert(this.#used >= units, "Capacity lease underflow");
      this.#used -= units;
    } };
  }

  #assertUnits(units: number): void {
    assert(Number.isSafeInteger(units) && units > 0, "Capacity units must be a positive integer");
    assert(Number.isSafeInteger(this.#used + units), "Capacity usage exceeds safe arithmetic");
  }
}
