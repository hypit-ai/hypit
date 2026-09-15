/**
 * The Studio page-lifecycle state for an authorization in progress, with no DOM and no network.
 *
 * `pagehide` must release an open authorization synchronously: the browser may restore the page from
 * the back-forward cache, where the guarded cleanup of the invalidated request correctly refuses to
 * touch any state — leaving the restored page permanently busy if the handler did not clear it here.
 * A monotonically increasing generation keeps a late answer from an older attempt out of the panel.
 */
export type ConnectLifecycle = {
  readonly generation: number;
  readonly busy: boolean;
  readonly pendingGeneration: number | undefined;
};

export function createConnectLifecycle(): {
  readonly state: () => ConnectLifecycle;
  /** Begin an attempt: invalidate whatever ran before it and become the current one. */
  begin(): { readonly generation: number };
  setBusy(busy: boolean): void;
  /** Open an authorization at this generation. */
  open(generation: number): void;
  /** Release the open authorization without running any async cleanup. */
  release(): { readonly releasedGeneration: number | undefined };
} {
  let generation = 0;
  let busy = false;
  let pendingGeneration: number | undefined;
  return {
    state: () => ({ generation, busy, pendingGeneration }),
    begin() {
      generation += 1;
      return { generation };
    },
    setBusy(next) {
      busy = next;
    },
    open(next) {
      pendingGeneration = next;
    },
    release() {
      const released = pendingGeneration;
      generation += 1;
      pendingGeneration = undefined;
      busy = false;
      return { releasedGeneration: released };
    },
  };
}
