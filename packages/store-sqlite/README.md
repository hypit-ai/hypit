# `@hypit/store-sqlite`

Private durable state used by `@hypit/runtime-local`.

One SQLite file stores Build facts, external Operations, the active Build work set, capacity reservations
a small output catalog, resource waiters and action rate budgets. No ready-command queue is stored: Core derives ready work from the saved
Build facts whenever the Worker advances it.

Operation receipts retain task IDs, original Need identity and credential references until the Result
has recorded them. Unknown remote outcomes do not keep a failed Build active.

Artifact bytes and secret credential values never enter this database. Components and Endpoint packages do not import
SQLite. `SqliteRuntimeState` exposes the narrow stores needed by the local Runtime and owns their shared
connection.
