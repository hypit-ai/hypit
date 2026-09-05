/** Provider capacity belongs to active Runtime execution, not to a Build lifecycle. */
export type CapacityResourceClaim = {
  readonly id: string;
  readonly limit: number;
  /** Number of units held by this Command; ordinary requests occupy one. */
  readonly units?: number;
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
  return units;
}

/** Capacity held by one executing Command, including a pending external Operation. */
export type CapacityReservation = {
  readonly build: string;
  readonly command: string;
  readonly resources: readonly CapacityResourceClaim[];
  readonly createdAt: number;
};

export type CapacityAcquireRequest = {
  readonly build: string;
  readonly command: string;
  readonly resources: readonly CapacityResourceClaim[];
  readonly now: number;
};

export type CapacityAcquire =
  | { readonly status: "acquired"; readonly reservation: CapacityReservation }
  | {
      readonly status: "blocked";
      readonly availableAt: number;
      readonly reason: "resource-in-flight";
      readonly resource: string;
    };
