# `@narratage/store-sqlite`

Durable local adapters for the environment-neutral Build, Operation and Dispatch ports.

One SQLite file may physically contain the execution tables and an optional Host index, but their
interfaces remain separate:

- BuildStore persists verified Core facts with compare-and-swap revisions;
- OperationStore persists external attempt identities, checkpoints and completions;
- BuildDispatchStore persists current Build admission, leases and generic capacity reservations;
- BuildCatalog indexes source/run paths and output aliases for Host presentation only;
- no ready-command queue is stored. Core regenerates readiness from BuildState after every restart.

Artifacts and credentials never enter this database. The adapter owns its private pre-release
schema `6`; Core and Endpoint packages do not import SQLite. Incompatible development databases are
rejected and recreated explicitly instead of carrying migration code before the first release.

`createSqliteRuntimeComponentPackage()` returns one physical package with three separately selectable
execution Components plus a Host-only `catalog` handle. They share one connection and one close
lifecycle. The catalog is deliberately absent from the Runtime Component Manifest and Runtime
Closure; changing the Host-only catalog table therefore cannot change the identity under which an
active Build continues.
