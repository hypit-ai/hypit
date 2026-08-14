# `@narratage/runtime`

Environment-neutral execution and persistence ports around the domain-free Core state machine.

The first implementation contains:

- `RuntimeCommandExecutor`: regenerate Core-authorized commands and execute one by identity;
- `LocalBuildScheduler`: one authoritative, queue-free scheduler shared by multiple Builds;
- atomic generic resource claims with Runtime Profile overrides;
- static Runtime Module facets, sealed Profile resolution and a content-addressed Runtime Closure;
- exact Endpoint capability/return bindings and implementation digests;
- `BuildStore` and `OperationStore` ports with compare-and-swap in-memory references;
- a recoverable Endpoint lifecycle that creates an Operation before `start`, checkpoints `pending`,
  calls `resume` after a restart, and records wake, retry, failure and cancellation state;
- a narrow `CredentialStore`/`CredentialRef` port that keeps secrets out of framework facts.
- one host-neutral `RuntimeServicePackage` ABI that binds configured Scheduler, BuildStore,
  OperationStore, ArtifactStore and CredentialStore implementations to their exact Manifest facet;
  one physical package may expose several separately selected services.

A Runtime assembly owns the lifecycle of the configured packages passed to it and closes each once.
Selection grants service authority; merely being installed never grants scheduling, storage or
credential authority. These remain trusted deployment packages, not author-importable modules.

The Scheduler does not traverse Graphs, choose Candidates, rewrite Needs or accept arbitrary
serialized commands. Core remains the sole source of readiness and the sole Event acceptance law.
Resources only limit how many already-authorized commands execute concurrently. Provider Endpoints
claim both an explicit Authority and an exact capability Route; the Store acquires them atomically.
An Endpoint's vendor-side job system remains internal and cannot advance another Build step.

`MemoryBuildStore` stores verified BuildState only. `MemoryOperationStore` separately records a
content-addressed attempt identity, pending checkpoint and terminal result. The Operation id is also
the stable key supplied to an upstream system when it supports idempotent submission.
Changing the Build, Command, Endpoint implementation or Runtime Closure changes that identity.
Nothing in the OperationStore becomes an accepted domain fact until an Endpoint completion is
validated and reduced by Core. If a process stops after completion is persisted but before Core
accepts its Event, the next run reconstructs the same Event from the stored completion and does not
call the Endpoint again.

This package is an environment-neutral reference, not a durable queue. SQLite/filesystem adapters,
environment credentials, the local follow loop, Endpoint implementations and
`@narratage/endpoint-kit` live in separate packages. The repository already contains KIE, Vertex and
several local media/service Endpoint packages; distributed attempt leases and additional hosted
adapters remain deployment work. An Endpoint whose upstream API cannot look up or deduplicate the
supplied Operation id cannot promise exactly-once remote work across the crash window; its
`resume(undefined)` must explicitly reconcile that uncertainty.
