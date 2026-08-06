# `@svml/store-sqlite`

Durable local adapters for the environment-neutral `BuildStore` and `OperationStore` ports.

One SQLite file may physically contain both tables, but the two interfaces remain separate:

- BuildStore persists verified Core facts with compare-and-swap revisions;
- OperationStore persists external attempt identities, checkpoints and completions;
- no ready-command queue is stored. Core regenerates readiness from BuildState after every restart.

Artifacts and credentials never enter this database. The adapter owns its private, versioned schema;
Core and Provider packages do not import SQLite or run these migrations.
