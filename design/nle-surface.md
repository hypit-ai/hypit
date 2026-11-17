# NLE Editing Surface

> Status: current application-composition design over NLE Project and NLE View owner Services.

## Purpose

An NLE Editing Surface is the typed application port used by a Studio, Agent tool or another interactive Host. It
composes one already-open `NleProjectService`, one already-open `NleViewService`, explicitly
selected package contributions and finite NLE projections.

It composes the two owner Services for one editing interaction:

```text
NleEditingSurface
├─ NleProjectService       Project facts and revision
├─ NleViewService          View facts and revision
├─ installed contributions
├─ Timeline / Canvas / Inspector observations
└─ guarded Commands routed to the owning Service
```

## Observation

The Surface exposes typed observations for status, open, Timeline, Canvas and one Item Inspector. Open returns the two
owner snapshots, semantic capabilities and the initial Timeline and Canvas scenes. Package and Host observations are
invocation-local inputs; they are merged into projections and never written into either owner document.

Project revision and View revision remain independent. Surface status reports both, their individual dirty and
history state, and whether the View still references the accepted Project snapshot. It invents no combined revision,
generation or persistent format marker.

## Command

Surface Commands cover:

- guarded Project and View transactions;
- Inspector field edits replanned against the current Inspector contribution;
- spatial edits replanned against current Canvas capabilities;
- Project and View undo or redo;
- explicit View reconciliation after an independently accepted Project change.

Any operation whose validity depends on both owners carries both expected revisions. The Surface re-resolves View
locks and semantic capabilities immediately before forwarding the resulting ordinary transaction to the Project
Service. Inspector functions and client observations are never trusted as direct JSON paths or complete replacement
objects.

The View guard validates the completed Project transaction as one atomic result, then checks touched Tracks against
the before and completed snapshots. It does not require each command prefix to be a separately valid Project; atomic
owner operations such as creating a Transition overlap and relation remain expressible without exposing an invalid
intermediate snapshot.

A Project Command may leave independently persisted View references stale. The successful Project mutation remains
accepted and status reports `stale`; reconciliation is a separate explicit View mutation. There is deliberately no
cross-file distributed transaction or silent cleanup.

## Receipt and subscription

A Command receipt reports current owner revisions and dirty/history state, which owner changed and which rebuildable
projections were invalidated. It is transient application feedback, not an event log or persistent protocol format.

The Surface forwards Project and View Service observations through one subscription while preserving the producing
owner and change kind. An adapter may project this port to HTTP, IPC or an Agent tool, but transport routes and
serialization envelopes do not become NLE semantics.

## Exclusions

The Surface does not own:

- file paths, file watching, atomic writes or external-change policy;
- selection, playhead, zoom, pointer drafts or optimistic UI state;
- AVIR execution, preview generations, export/review Actions or cancellation;
- HTTP, IPC, CLI or browser resource URLs;
- Media catalogs or package discovery.

A local Host may connect persistence adapters and audiovisual Executor clients beside this Surface. Those adapters
call owner savepoints only after their own writes complete and retain their own conflict and Action lifecycles.

## Package and evidence

The first implementation is the `@hypit/nle/surface` subpath in the existing NLE release unit. Evidence establishes
that one open Surface:

- produces coherent finite observations from both owner snapshots;
- rejects stale Project or View revisions before mutation;
- replans Inspector and spatial edits through current package semantics and View guards;
- reports projection invalidation without creating another authority;
- makes stale cross-owner references observable and repairs them only through explicit reconciliation;
- forwards owner changes and releases subscriptions when closed.
