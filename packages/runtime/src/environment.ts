export type RuntimeEnvironmentStore = {
  /** Select this literal normalized configuration, changing it only when no Runtime work is active. */
  use(config: string): Promise<void>;
  /** Refuse work when this Runtime instance was assembled from a different active configuration. */
  assert(config: string): Promise<void>;
};
