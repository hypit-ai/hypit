/** Provider capacity belongs to active Runtime execution, not to a Build lifecycle. */
export type CapacityResourceClaim = {
  readonly id: string;
  readonly limit: number;
};

/** One asynchronous external Operation that currently occupies Provider capacity. */
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
