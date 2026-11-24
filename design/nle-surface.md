# NLE Editing Surface

The NLE Editing Surface exposes Project transactions and finite Timeline, Canvas and Inspector projections.
It composes one open `NleProjectService`, selected package contributions and an editing context supplied by the caller.

```text
NLE Editing Surface
├─ NLE Project Service        SVML facts, revision, history and savepoint
├─ Editing context            active Composition and locked Track IDs
├─ Selected package contributions
└─ Timeline, Canvas and Inspector projections
```

A Studio Product Session owns its editing context. A new session starts at the SVML root with an empty set of locks.
When a Project edit removes the active Composition, Studio returns to the current root. It discards locks for removed
Tracks. The direct Surface API defaults to the root Composition and unlocked Tracks when the caller supplies no context.

## Commands and observations

The Surface exposes status, open, Timeline, Canvas, Item Inspector and Transition Inspector observations. It projects
frame coordinates using the Project's edit rate. Observation resources and package projections are invocation-local.

Every mutation checks the expected Project revision. The Surface resolves current capabilities and checks session
locks against the touched Tracks before and after the complete transaction. This lets one transaction introduce a
Transition and its overlap together. Project undo and redo replay the one owner history. A lock or navigation change
affects the current session and invalidates its relevant projections.

Receipts report the current Project revision, dirty and history state, whether the Project changed and the
invalidated projections. The Surface forwards Project Service changes and releases its subscription when closed.
File writes, transports, Media catalogs and audiovisual Executors belong to the caller's composition.

## Presentation and authoring facets

Explicitly selected installed component packages may contribute bounded presentation and authoring facets. Timeline
presentation supplies readable titles and text from the Item and its authored values. Inspector presentation can
provide finite fields and process-local operation projectors.
Neither can inject markup, create Track structure, persist UI state or acquire Project authority. A separate
authoring contribution must accept an Inspector operation and plan an ordinary Project transaction before an edit is
possible. npm installation and the selected Host decide which contributions exist; a missing or duplicate symbol is
observable.

Presentation and authoring remain separate facets even when one package supplies both. Studio owns Timeline styling
and reads source previews from the Media or audiovisual executor. An Inspector contribution uses the product's finite control vocabulary;
its process-local operation projector is removed from the Scene before transport. The browser returns a stable
section/field address and scalar value, then the Host recomputes the operation from the current snapshot. It never
submits a package JSON path or executes package code.

The Inspector vocabulary includes scalar fields and finite collections. A collection contains package-owned stable
row ids, finite row fields and optional actions. Field ids are unique in their section. A row action is addressed
by section, collection, row and action ids and is resolved from a fresh projection at the expected revisions. The
browser receives data and action availability. The owner reducer replaces the current closed value. Canvas remains
Item-level until a selected package proves a need for bounded semantic handles.

### Field display and writeback

NLE binds structural controls to the fields selected by the SVML Item's kind and source and its Track's role. For Component and
Operator values, the selected package binds its field and row ids to the explicit parameters and value slots it
owns. The binding defines what to read, how to format it in a finite control and which authored value to replace
when edited. A field keeps the owner of its value when displayed through a reference. The Host resolves the
current target and applies the write through the revisioned Project transaction.

An Item name is an authored label. Text and subtitle Components provide a pure `readText` function over their
authored parameters. The Surface projects the result as plain text for the Timeline. Filter and effect Tracks
display Item names. Names and text content retain independent editing targets.

A Component value Inspector section uses the same exact installed `(Component, slot)` contribution for inline and
shared ownership. Inline ownership projects the selected Item; shared ownership additionally projects the one
Project-owned resource and its current Item users. The NLE `picture.layout` declaration is projected directly by the
Canvas and Inspector. Shared ownership uses the same owner identity and reverse-user index in both cases.

A shared-value edit is offered only when every affected user's Track is writable; the resulting command
replaces the one Project Shared Value through the Project Service. Editing an inline value, linking or unlinking one
Item changes only that occurrence and checks only its own Track. Unlinking copies the resolved value inline into the Item.

The Canvas projection exposes only Item-level Picture frames owned by NLE. It does not inspect a Component's private
render tree merely because the renderer can expose pixels or DOM. Source extent is an invocation-local observation;
the authored crop, frame, fit and focus stay Project facts. The projected fitted content uses the selected Source
extent. Session track locks constrain the spatial capabilities offered through that editing surface. Editing a crop
checks the Item's Track, including when its layout is shared.

## Package

`@hypit/nle/surface` is the NLE release's typed editing port and the entry point for Timeline, Canvas and Inspector
projections and their authoring and presentation contributions.
