# `@hypit/store-sqlite`

Private durable state used by `@hypit/runtime-local`.

One SQLite file stores Build facts, external Operations, the active Build work set, capacity reservations
and a small output catalog. No ready-command queue is stored: Core derives ready work from the saved
Build facts whenever the Worker advances it.

Artifacts and credentials never enter this database. Components and Endpoint packages do not import
SQLite. `SqliteRuntimeState` exposes the narrow stores needed by the local Runtime and owns their shared
connection.
