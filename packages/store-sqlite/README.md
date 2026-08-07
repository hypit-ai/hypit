# `@narratage/store-sqlite`

Durable local adapters for the environment-neutral `BuildStore` and `OperationStore` ports.

One SQLite file may physically contain the execution tables and an optional Host index, but their
interfaces remain separate:

- BuildStore persists verified Core facts with compare-and-swap revisions;
- OperationStore persists external attempt identities, checkpoints and completions;
- BuildCatalog indexes source/run paths and output aliases for Host presentation only;
- no ready-command queue is stored. Core regenerates readiness from BuildState after every restart.

Artifacts and credentials never enter this database. The adapter owns its private, versioned schema;
Core and Endpoint packages do not import SQLite or run these migrations.

`createSqliteRuntimeServicePackage()` returns one physical package with two separately selectable
execution services plus a Host-only `catalog` handle. They share one connection and one close
lifecycle. The catalog is deliberately absent from the Runtime service Manifest and Runtime
Closure; a physical catalog schema migration therefore cannot change the identity under which an
active Build resumes.
