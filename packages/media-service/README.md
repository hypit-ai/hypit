# `@hypit/media-service`

Project-scoped application service for the shared `media/` collection.

Media Asset manifests remain the only authored authority. This package projects those manifests into one finite
Catalog shared by NLE, Generation, Scene and future Benches. The Catalog generation, summaries and resource paths
are rebuildable Host state; they are never serialized into an NLE, Graph, Scene or `media-library.json`.

`@hypit/media-service/node` supplies the first service implementation. It establishes a `media/` watcher before its
first asynchronous reconciliation, publishes only completed snapshots atomically and serves subsequent observations
and resource lookups from memory. A full reconciliation recursively discovers the current Manifest set, reuses cached
entries whose Manifest and primary resource file stamps have not changed, and bounds concurrent file reads. Precise
Manifest and known primary-resource events reconcile only their affected entries. Directory changes, watcher errors
and ambiguous renames deliberately fall back to a full reconciliation instead of guessing. Events are debounced and
merged; concurrent reconciliations do not expose partial snapshots, while an event arriving during one pass schedules
another pass. A reconciliation that finds no observable change reuses the current generation instead of notifying
surfaces again. Watcher errors also re-establish the watcher. Consumers may subscribe to completed Catalog generations
without coupling the service to SSE, WebSocket, Desktop IPC or another transport. The first slice deliberately has no
SQLite store; persistence can be added behind the same service boundary without changing consumers.

## Node HTTP adapter

`startNodeProjectMediaHttpServer()` is the loopback-Web adapter over that same application service. An embedding Project
Host normally injects its shared service; a standalone caller may let the adapter own one. The adapter does not create a
second Catalog, watcher or writer.

- `GET /api/project/media` observes the current complete Catalog.
- `GET /api/project/media/events` publishes complete changed generations as `catalog` server-sent events. It is a
  one-way observation channel; Media commands remain ordinary HTTP requests, so WebSocket is unnecessary.
- `GET|HEAD /api/project/media/resource?asset=...&revision=...` reads a primary resource only for the observed resource
  revision. The revision is an opaque file-observation token, not a content hash or durable identity.
- `POST /api/project/media/refresh` asks the service to reconcile explicitly.
- `POST /api/project/media/representation` commits one attach／replace／detach command and returns its receipt. A stale
  Manifest revision returns HTTP 409 with the current conflict evidence.

The HTTP shape is an adapter contract, not part of the Media Asset document or domain model. Desktop IPC can project the
same observation and command interfaces without routing through HTTP.

The Node entry also provides an invocation-local lease pool. Independently opened NLE and Generation Canvas Benches
for the same Project Boundary receive the same live service while their sessions overlap. Releasing the last surface
closes that service. This pool is Project Host composition, not an authored registry or another project database.

Consumers retain their own authority. The service returns project-relative `ProjectObjectRef`s; an NLE or Generation
application service converts a selected reference relative to its own document only when it commits its own command.
The Catalog contains no usage count, Track, Item, Canvas node or reverse-reference table.

Representation candidate production also stays outside this package. Media Asset domain model owns direct
attach／replace／detach operations for already accepted declarations. The Node service serializes these author commands,
atomically replaces the manifest and publishes a completed Catalog generation. Each command carries the opaque
Manifest revision returned by its Catalog observation, so two surfaces sharing the Project Host cannot silently
overwrite one another's newer edit. The returned receipt carries the next revision. These revisions are transient
optimistic-concurrency tokens, not persistent document versions or history. The service does not run WhisperX, inspect
candidate contents or retain old declarations. Staging and package validation belong to a future package-contributed
candidate-acceptance adapter before this command boundary.
