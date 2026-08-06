# `@svml/runtime`

Environment-neutral execution and persistence ports around the domain-free Core state machine.

The first implementation contains:

- `RuntimeCommandExecutor`: regenerate Core-authorized commands and execute one by identity;
- `LocalBuildScheduler`: one authoritative, queue-free scheduler shared by multiple Builds;
- named concurrency lanes with Runtime Profile overrides;
- static Runtime Module facets, sealed Profile resolution and a content-addressed Runtime Closure;
- exact Provider capability/return bindings, implementation digests and permission allowlists;
- `BuildStore` and `OperationStore` ports with compare-and-swap in-memory references;
- a recoverable Provider Endpoint lifecycle that journals before `start`, checkpoints `pending`,
  calls `resume` after a restart, and records wake, retry, failure and cancellation state;
- a narrow `CredentialStore`/`CredentialRef` port that keeps secrets out of framework facts.

The Scheduler does not traverse Graphs, choose Candidates, rewrite Needs or accept arbitrary
serialized commands. Core remains the sole source of readiness and the sole Event acceptance law.
Lanes only limit how many already-authorized commands execute concurrently. A Provider's remote job
queue is still internal to that Endpoint and cannot advance another Build step.

`MemoryBuildStore` stores verified BuildState only. `MemoryOperationStore` separately records a
content-addressed attempt identity, stable submission key, pending checkpoint and terminal result.
Changing the Build, Command, Endpoint implementation or Runtime Closure changes that identity.
Nothing in the Operation journal becomes an accepted domain fact until an Endpoint completion is
validated and reduced by Core. If a process stops after completion is journaled but before Core
accepts its Event, the next run reconstructs the same Event from the stored completion and does not
call the Endpoint again.

This package is an environment-neutral reference, not a durable queue. SQLite/filesystem adapters,
environment credentials, the local follow loop and the Provider SDK live in separate packages;
distributed attempt leases and production Provider adapters remain future work. An Endpoint
whose upstream API cannot look up or deduplicate the supplied `submissionKey` cannot promise
exactly-once remote work across the crash window; its `resume(undefined)` must explicitly reconcile
that uncertainty.
