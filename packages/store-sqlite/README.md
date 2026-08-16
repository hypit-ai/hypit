# `@narratage/store-sqlite`

Durable local adapters for the environment-neutral Build, Operation and Dispatch ports.

One SQLite file may physically contain the execution tables and an optional Host index, but their
interfaces remain separate:

- BuildStore persists one Definition and appends admitted Core Facts in order;
- OperationStore persists external attempt identities, checkpoints and completions;
- BuildDispatchStore persists the local Build queue and remote in-flight capacity reservations;
- BuildCatalog indexes source/run paths and output aliases for Host presentation only;
- no ready-command queue is stored. Core regenerates readiness from Definition plus Facts after every restart.

Artifacts and credentials never enter this database. The adapter owns its private pre-release
schema `9`; Core and Endpoint packages do not import SQLite. Incompatible development databases are
rejected and recreated explicitly instead of carrying migration code before the first release.

`createSqliteRuntimeInfrastructurePackage()` returns one configured instance with three separately selectable
parts plus a Host-only `catalog` handle. They share one connection and one close
lifecycle. The catalog is deliberately absent from the Runtime infrastructure Manifest and Runtime
Closure; changing the Host-only catalog table therefore cannot change the identity under which an
active Build continues.
