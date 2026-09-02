export type RuntimeWorkerLease = {
  readonly owner: string;
  readonly pid: number;
  readonly acquiredAt: number;
  readonly expiresAt: number;
};

export type RuntimeWorkerLeaseStore = {
  read(): Promise<RuntimeWorkerLease | undefined>;
  /** Acquire the one live Runtime worker slot, replacing only an expired lease. */
  acquire(request: RuntimeWorkerLease): Promise<boolean>;
  /** Renew only the lease held by this exact owner and process. */
  renew(owner: string, pid: number, expiresAt: number): Promise<boolean>;
  /** Release only the caller's own lease. */
  release(owner: string, pid: number): Promise<void>;
};
