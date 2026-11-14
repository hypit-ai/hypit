import type { CapacityResourceClaim } from "@hypit/execution-environment";

/** Capacity held by one executing Generation Command, including a pending external Operation. */
export type CapacityReservation = {
  readonly build: string;
  readonly command: string;
  readonly resources: readonly CapacityResourceClaim[];
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
