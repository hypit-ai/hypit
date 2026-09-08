/** A shared resource: occupancy when periodMs is absent, a replenishing rate budget otherwise. */
export type CapacityResourceClaim = {
  readonly id: string;
  readonly limit: number;
  /** Number of units held by this Command; ordinary requests occupy one. */
  readonly units?: number;
  /** Replenish `limit` units per period, with a burst of at most `limit`. Rate units are not returned. */
  readonly periodMs?: number;
};

export function capacityUnits(resource: CapacityResourceClaim): number {
  const units = resource.units ?? 1;
  if (resource.id.trim().length === 0 || !Number.isSafeInteger(resource.limit) || resource.limit < 1
    || !Number.isSafeInteger(units) || units < 1) {
    throw new Error(`Capacity ${resource.id} requires a positive integer limit and units`);
  }
  if (units > resource.limit) {
    throw new Error(`Capacity ${resource.id} request needs ${units} units but its limit is ${resource.limit}`);
  }
  if (resource.periodMs !== undefined && (!Number.isSafeInteger(resource.periodMs) || resource.periodMs < 1)) {
    throw new Error(`Resource ${resource.id} periodMs must be a positive integer`);
  }
  return units;
}

/** Capacity held by one executing Command, including a pending external Operation. */
export type CapacityReservation = {
  readonly build: string;
  readonly command: string;
  readonly resources: readonly CapacityResourceClaim[];
  readonly createdAt: number;
  readonly lifetime?: "action" | "operation";
};

export type CapacityAcquireRequest = {
  readonly lifetime?: "action" | "operation";
  readonly build: string;
  readonly command: string;
  readonly resources: readonly CapacityResourceClaim[];
  readonly now: number;
};

export type CapacityAcquire =
  | { readonly status: "acquired"; readonly reservation: CapacityReservation }
  | {
      readonly status: "blocked";
      /** Absent when only a resource release can make this work ready. */
      readonly availableAt?: number;
      readonly reason: "resource-in-flight" | "rate-limit";
      readonly resource: string;
    };
