export type DispatchPhase = "queued" | "running" | "waiting" | "terminal";
export type DispatchTerminal = "complete" | "failed" | "cancelled";

export type BuildDispatchRequest = {
  readonly build: string;
  /** Installed component packages loaded when a Worker claims this Build. */
  readonly componentPackages: readonly string[];
};

export type BuildDispatchSnapshot = BuildDispatchRequest & {
  readonly createdAt: number;
  readonly availableAt: number;
  readonly phase: DispatchPhase;
  readonly reason?: string;
  readonly cancellation?: {
    readonly reason?: string;
  };
  readonly terminal?: DispatchTerminal;
};

export type BuildDispatchRelease = {
  readonly phase: "queued" | "waiting";
  readonly availableAt: number;
  readonly reason?: string;
};

export type DispatchQuery = {
  readonly phases?: readonly DispatchPhase[];
};

export type CapacityResourceClaim = {
  readonly id: string;
  readonly maxActive: number;
  readonly maxInFlight: number;
};

/** One asynchronous external Operation that currently occupies Provider capacity. */
export type CapacityReservation = {
  readonly id: string;
  readonly build: string;
  readonly command: string;
  readonly resources: readonly CapacityResourceClaim[];
  readonly queue?: {
    readonly pool: string;
    readonly lane: string;
  };
  readonly createdAt: number;
};

export type CapacityAcquireRequest = {
  readonly build: string;
  readonly command: string;
  readonly resources: readonly CapacityResourceClaim[];
  readonly queue?: CapacityReservation["queue"];
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

/** Durable queue state. Process ownership belongs to the Runtime Host, not each Build row. */
export type BuildDispatchStore = {
  create(request: BuildDispatchRequest, options?: {
    readonly now?: number;
  }): Promise<BuildDispatchSnapshot>;
  read(build: string): Promise<BuildDispatchSnapshot | undefined>;
  list(query?: DispatchQuery): Promise<readonly BuildDispatchSnapshot[]>;
  claim(now?: number): Promise<BuildDispatchSnapshot | undefined>;
  release(build: string, update: BuildDispatchRelease): Promise<BuildDispatchSnapshot>;
  finish(build: string, terminal: DispatchTerminal, reason?: string): Promise<BuildDispatchSnapshot>;
  requestCancellation(build: string, reason?: string): Promise<BuildDispatchSnapshot>;
  acquireCapacity(request: CapacityAcquireRequest): Promise<CapacityAcquire>;
  releaseCapacity(id: string): Promise<void>;
  releaseBuildCapacity(build: string): Promise<void>;
  listCapacity(): Promise<readonly CapacityReservation[]>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function capacityReservationId(build: string, command: string): string {
  assert(build.trim().length > 0 && command.trim().length > 0, "Capacity reservation identity is empty");
  return `capacity:${encodeURIComponent(build)}:${encodeURIComponent(command)}`;
}
