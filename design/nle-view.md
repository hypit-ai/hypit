# NLE View

> Status: current owner design for durable NLE editing arrangement and guards.

## Purpose

An NLE View is an optional durable editor document over one NLE Project. It owns how an author wants that Project
arranged and guarded for editing; it never owns audiovisual content and never participates in AVIR lowering.

Project and View remain separate owner documents:

```text
NLE Project                         NLE View
tracks, items, time, Processes        active Composition, grid
picture and audio meaning           Track locks and row heights
AVIR lowering                       linked-edit Groups
```

The renderer-facing `view` or `EditProject` object used by a product is a rebuildable projection, not this durable
NLE View document. It may contain the finite timeline and inspector data needed by the surface, but it does not become
another audiovisual authority or a second serialized representation of SVML.

Selection, playhead, zoom, scroll, hover, current tool, snap candidates and pointer drafts are open Host Session
facts. Thumbnails, waveforms and preview frames are rebuildable Host or Executor observations. Neither category is
serialized in the View.

## Persistent document

The format kind is `hypit.nle-view`. npm and the project lockfile select the Reader implementation.
The document contains:

- its local id and name;
- one portable path to its NLE Project document;
- the Composition initially opened by this View;
- one positive rational display and editing rate;
- sparse editor state partitioned by Project Composition;
- Track lock and optional durable row height inside each partition.
  Subtitle, text and effect Tracks use the same compact row height;
- linked-edit Groups whose Items all belong to that Composition.

Partitioning by Composition preserves the address basis after NLE Projects gained multiple reusable definitions.
A Group never spans Composition timelines. The View does not persist a Project id copy, package presentation,
Programme output, component parameters or renderer state.

## Independent lifetime

One opened View document has one `NleViewService`. Its process-local revision, serial transactions, undo and redo
history, dirty state, savepoint and observation are independent from `NleProjectService`. None is serialized.

Project and View files do not share a distributed transaction. A Project edit may leave View references stale.
The Host can report that state or explicitly reconcile the View against an accepted Project snapshot. Reconciliation
drops missing Composition, Track and Group references and falls back to the Project Root when the active Composition
was removed. It is an explicit View mutation, not background repair or file hashing.

## Guards and authority

A Track lock is a guard at a View-backed editing surface. Before forwarding a Project transaction, that surface asks
whether the transaction touches a Track locked by this View. The Project Service remains the Project authority:
another View, an Agent, a CLI or another explicit program may submit the same Project transaction through its own
policy. Locking therefore changes neither Project validity nor audiovisual output.

Linked-edit Groups preserve durable editing intention but do not rewrite Project relations. A later authoring
projection may use them to plan one explicit multi-Item Project transaction. The caller still submits that complete
transaction to the Project Service; the View never mutates the Project by itself.

## Projection seam

Timeline, Canvas and Inspector scenes are finite rebuildable projections of:

```text
Project snapshot + View snapshot + invocation-local observations + product policy
```

Explicitly selected installed component packages may contribute bounded presentation and authoring facets. Timeline
presentation can provide factual titles and text, Studio-owned presentation tokens and artwork bytes behind a
Host-owned resource address. Inspector presentation can provide finite fields and process-local operation projectors.
Neither can inject markup, create Track structure, persist UI state or acquire Project authority. A separate
authoring contribution must accept an Inspector operation and plan an ordinary Project transaction before an edit is
possible. npm installation and the selected Host decide which contributions exist; a missing or duplicate symbol is
observable.

A Shared Value Inspector section projects one Project-owned resource, its typed declaration and its current Item users
rather than presenting the value as local Item state. A package Component declaration delegates fields and edits to
the exact installed `(Component, slot)` contribution. The NLE `picture.layout` declaration is projected directly by
the Canvas and Inspector. Both use the same shared owner identity and reverse-user index.

A View-backed shared-value edit is offered only when every affected user's Track is writable; the resulting command
replaces the one Project Shared Value through the Project Service. Linking or unlinking one Item changes only that
occurrence and checks only its own Track. No Shared Value or binding is copied into the View document.

The Canvas projection exposes only Item-level Picture frames owned by NLE. It does not inspect a Component's private
render tree merely because the renderer can expose pixels or DOM. Source extent is an invocation-local observation;
the authored frame, fit and focus stay Project facts. View locks constrain the spatial capabilities offered through
that editing surface.

## Package and required behavior

View modules begin at the `@hypit/nle/view` subpath because Project and View share the NLE owner vocabulary and release
lifecycle. A separate npm release boundary is not yet justified.

The implementation preserves these invariants:

- strict parse/serialize round-trips the current durable View facts;
- Track state and Groups are scoped to an existing Composition and cannot cross it;
- View transactions are atomic and independently revisioned only by the open View Service;
- stale Project references require explicit reconciliation;
- a View lock guards only Project edits initiated through that View;
- the active Composition, grid, Track arrangement, Groups and finite observations project into one read-only
  Timeline scene;
- package authoring declarations and View guards resolve semantic Timeline and spatial capabilities before a product
  applies its smaller affordance policy;
- installed packages contribute bounded Timeline and Inspector presentation without owning URLs, markup or Project
  mutation;
- Canvas exposes only active-Composition Item frames; Inspector begins from one active-Composition Item and may also
  expose the Project Shared Values explicitly bound by that Item. Inspector edits become explicit Project transactions
  through declaration-specific authoring semantics;
- package Component and NLE Picture-layout sections expose the same Shared Value owner shape and apply every affected
  View Track guard while keeping link and unlink occurrence-local;
- View changes cannot affect AVIR lowering.
