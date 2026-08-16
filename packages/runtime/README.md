# `@narratage/runtime`

Environment-neutral execution and persistence ports around the domain-free Core state machine.

The first implementation contains:

- `RuntimeCommandExecutor`: regenerate Core-authorized commands and execute one by identity;
- `LocalBuildScheduler`: one authoritative, queue-free scheduler shared by multiple Builds;
- in-process command limits plus durable Provider pool and capability-lane limits for remote work;
- static Runtime Module facets and explicit Profile resolution;
- exact Endpoint capability/return offers;
- `BuildStore` for Definitions and appended Core Facts, plus a separate `OperationStore`;
- a recoverable Endpoint lifecycle that creates an Operation before `start`, checkpoints `pending`,
  calls `resume` after a restart, and records wake, retry and terminal state;
- a narrow `CredentialStore`/`CredentialRef` port that keeps secrets out of framework facts.
- one host-neutral `RuntimeInfrastructurePackage` ABI that binds configured Scheduler, BuildStore,
  OperationStore, ArtifactStore and CredentialStore implementations to their selected Manifest facet;
  one configured package instance may expose several separately selected parts.

A Runtime assembly owns the lifecycle of the configured packages passed to it and closes each once.
Role selection grants a part one responsibility; merely being installed never grants scheduling, storage or
credential authority. These remain trusted deployment packages, not author-importable modules.

The Scheduler does not traverse Graphs, choose Candidates, rewrite Needs or accept arbitrary
serialized commands. Core remains the sole source of readiness and the sole Command-result admission law.
Resources only limit how many already-authorized commands execute concurrently. Recoverable Provider
Endpoints occupy both an explicit Provider pool and an exact capability lane while remote work is in flight.
An Endpoint's vendor-side job system remains internal and cannot advance another Build step.

`MemoryBuildStore` stores one Definition and its admitted Facts. `MemoryOperationStore` separately records a
stable attempt identity, pending checkpoint and terminal result. The Operation id is also
the stable key supplied to an upstream system when it supports idempotent submission.
Changing the Build, Command, selected Endpoint or attempt changes that identity.
Nothing in the OperationStore becomes an accepted domain fact until an Endpoint completion is
validated by Core and appended to BuildStore. If a process stops after completion is persisted but before Core
accepts it, the next Worker reconstructs the same result from the stored completion and does not
call the Endpoint again.

This package is an environment-neutral reference, not a durable queue. SQLite/filesystem adapters,
environment credentials, the local follow loop, Endpoint implementations and
`@narratage/endpoint-kit` live in separate packages. The repository already contains KIE, Vertex and
several local media and external-program Endpoint packages. An Endpoint whose upstream API cannot look up or deduplicate the
supplied Operation id cannot promise exactly-once remote work across the crash window; its
`resume(undefined)` must explicitly reconcile that uncertainty.
