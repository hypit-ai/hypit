# NLE Studio product adapter

> Status: current NLE Product Provider and browser adapter design.

## Boundary

NLE Studio is a Product Provider and browser adapter over existing authorities. The long-lived ApplicationHost launches
one NLE Studio Product Session against an existing ProjectHost and exposes its finite protocol through the selected
local transport. A Desktop tab, direct browser launch or Agent view presents that same product Surface.

```text
Desktop tab · browser · Agent view
        │
ApplicationHost
        │ Product Session lease
NLE Studio Product Session
  selection · playhead · zoom · pointer drafts
        │ finite product projection
NLE Studio backend
  ├─ ProjectHost context
  │    ├─ shared Project Media Service
  │    ├─ selected Package Environment
  │    └─ open owner-Service leases
  ├─ NLE Editing Surface
  │    ├─ NLE Project Service
  │    ├─ NLE View Service
  │    └─ selected package contributions
  ├─ Studio preview Actions
  │    └─ injected HtmlFrameExecutor and HtmlVideoExecutor
  ├─ NLE Delivery Service
  │    └─ injected HtmlVideoExecutor
  └─ explicit Project/View file persistence
```

The NLE session backend is the product composition root. It leases the independently owned Project and View Services
from the ProjectHost registry; the Editing Surface routes each mutation to its fact owner. Closing the presenting
caller releases its Product Session lease without defining the ApplicationHost or ProjectHost lifetime.

The presenting caller mounts NLE Studio as one Product Surface. A product selector may choose among several installed
products, and the selected editor receives the viewport assigned to that Product Session.

## Lifetimes

The Project Service lives for the open NLE Project document and may be shared by several Product Sessions. An
explicitly selected View document has its own Service, revision and save lifecycle. When no View document is selected,
the NLE session backend creates a session-only View from the root Composition; it is never silently written beside the
Project.

Selection, playhead, viewport and pending pointer gestures live only in the browser client. Refreshing the page may
discard them without touching author facts. Timeline, Canvas and Inspector scenes are rebuildable finite projections.

Media catalog entries come from the ProjectHost's one Project Media Service. NLE Media references do not become a
second catalog, and another NLE or Canvas Product Session in the same project observes that same collection. The
Studio Preview Action captures a frame or prepares a bounded video interval against one active Composition and
accepted editing revision. The Action keeps its result for the Session until a new preview, an owner invalidation
or Session close. A structural Canvas remains available during editing and while a preview is prepared.

Video export is a Project-local `NleDeliveryService` Action. The Product Session starts it with the current
accepted Project revision. The selected Executor owns its FFmpeg/browser process tree. Session close cancels its
active Delivery Actions and revokes the Session resource addresses.

The browser's Media bin projects that shared catalog. Selecting an available entry explicitly places it at the current
playhead on a compatible unlocked Track. Studio resolves or creates that Track in the same transaction as
materialization. In structural Canvas mode, an accepted
image or video resource may be shown inside its Present Item's layout as source identification. This is a direct media
resource projection, not Component or Operator evaluation and not an audiovisual preview frame.

The session assembles NLE authoring, Timeline presentation and Inspector presentation contributions from the
ProjectHost's already selected Package Environment. The NLE contracts validate and index those process-local
capabilities; ProjectHost does not interpret them. NLE Studio additionally owns the finite `hypit.nle-component`,
`hypit.nle-process`, `hypit.nle-adjust` and `hypit.nle-transition` catalog contracts used by its text, subtitle, graphic, effect and
transition creation surfaces. Selecting an entry invokes the matching NLE materialization planner. The package owns
the exact Component or Operator symbol, closed initial parameters and declared defaults; it does not return arbitrary
Project commands.

Inspector contributions may project finite scalar fields and stable row collections. Every field id remains unique
within its section, so the browser submits only section, field and value; it never receives array indexes, JSON paths
or package functions. The backend resolves that field against the selected package's exact symbol and asks its pure
authoring reducer for replacement closed parameters. Package contributions cannot create Tracks, choose transaction
boundaries or persist interface state. Timeline presentation is descriptive only, while generic trim and split are
offered only when the selected package declares a conservative time-window operation.

A collection row may also declare actions. The browser submits the Item, section, collection, row and action
addresses with both revisions. The backend projects the current row again and runs the same guarded authoring
reducer used by scalar edits.

The Inspector separately projects NLE-owned ownership controls for existing Component value slots. An inline slot can
be shared or linked; a shared slot can be rebound or unlinked by copying its resolved value inline. These operations
change only explicit Item bindings and Project Shared Values and therefore use the same Surface revisions, View guards
and invalidations as every other Project transaction. The package contributes the slot's value semantics, not the
ownership transaction or its UI.

## Local protocol and persistence

Timeline dragging submits `timeline.drop` through `POST /api/operate`. The browser supplies selected Items, an
anchor Item, a frame delta and a Track or gap. Studio follows View Groups and connected Transition and Matte
endpoints, computes one exact time displacement and keeps each source lane together in relative visual order.
It searches compatible unlocked Tracks and allocates new ones for gaps or when needed. The drop planner avoids
new Picture Present collisions as a Studio editing policy. Audio intervals can mix on the selected Track.
The Editing Surface commits Track creation and Item movement in one guarded transaction.

The Timeline also submits trim, split and remove through `operate`. Split cuts the selected Items that cross
the playhead and commits them together. Remove deletes the explicit selection and its incident audiovisual relations.
When an edit leaves View references stale, Studio keeps the projections visible and offers explicit reconciliation
alongside Project undo.

Callers can close a gap at a frame or ripple-remove a contiguous selection by naming the Tracks to move.
The planner resolves the exact gap edges and shifts following Items once. It rejects an occupied gap and any
edit whose linked members would need to move outside the named Tracks or across the gap boundary.

Studio's session clipboard holds explicitly selected Items, exact relative placements and complete Transition,
Matte and View Group membership within one NLE document. Paste creates new Item and relation identities at the
playhead. It reuses the original Tracks if their current ordering, locks and occupied Picture ranges permit it,
or creates a new ordered set of Tracks in the active Composition. The Project edit commits once. Complete copied
Groups can then be applied by an explicit View operation with independent undo. Clipboard observations expose
counts for copy and paste availability and pending Groups.

Composition authoring can make a compound from one contiguous selection of Present Items in an enabled Track.
The backend moves the selected Items and complete relations into a child with the same canvas and rebases their
exact time. The parent occurrence occupies the selection's original paint position. Make-unique copies the
referenced Composition tree and retargets the selected occurrence. Its Project Media and Shared Value references
remain explicit shared references. Explode inserts a fresh copy of the children in the parent at the occurrence's
position when the source has one matching Track and the occurrence is full-duration with identity time and layout.
The source definition remains available to its other occurrences.

Opening a Composition occurrence changes the active View and records the previous playhead in that Studio Session.
Returning restores that frame. Selecting a Composition tab starts a fresh navigation path.

The loopback server serves the client and same-origin JSON operations for finite observation, guarded Surface commands,
save and reload. `POST /api/observe` accepts the Product Session's finite observation union. Initial `open` contains
status, Timeline, Canvas, Composition navigation, Item-to-Media projection, Media, Catalog, Preview and delivery
availability without embedding either complete owner document. Inspector is another keyed observation. The protocol is a product
adapter and carries no persistent format marker or independent revision. Project and View revisions remain visible
and separate.

Every accepted mutation returns one compact receipt containing current owner status, changed owners, invalidated
projection names and an optional result address. The browser retains unaffected projections and rereads only the
invalidated Timeline, Canvas, Media, Catalog, Preview or delivery observation. Inspector is reread only for the
selected Item when invalidated. `GET /api/events` streams NLE Project and View changes, Project Media Catalog
generations and Action progress. The browser rereads the finite open projection on connect or reconnect and
rereads invalidated projections on live edits.

`POST /api/actions` starts a frame preview, playback preview or delivery. `GET /api/actions/:handle` or
`observe({ kind: "action", handle })` reads current state. `DELETE /api/actions/:handle` requests cancellation.
A completed Action exposes a Session resource URL. Playback uses bounded MP4 intervals with programme audio. Studio
requests the next interval when the current interval ends, so a rendering wait can occur at an interval boundary.

The same endpoint starts `media.thumbnail`, `media.storyboard`, `media.waveform` and `media.audio-preview` against
one accepted Asset identity and Catalog generation. These operations sample the Asset's Media clock. Studio retains
a bounded set of results and revokes them when the Catalog changes or the Session closes.
The destination remains a portable Project path validated by that Service.

Within the Product Session mount, `POST api/media/import?name=...` carries one raw browser `File` body. The adapter
streams it to an invocation-local temporary file, calls the Node Project Media Service's adoption Action with bounded
container-index inspection, then
removes the temporary file. Multiple selected files are separate sequential requests. The route returns the refreshed
Media identity in its receipt and invalidates the Media projection. Media identity remains the resulting
project-relative Media Asset manifest path. This transport does not place the accepted Media into the NLE document.

Saving asks the selected Owner Provider to serialize each dirty owner snapshot, atomically replace its selected file
and mark that exact Service revision saved only after the write succeeds. Reload is an explicit user or caller
operation that accepts current file bytes into the corresponding Service. The Host performs no content hashing or
continuous integrity comparison.

The `operate` union also accepts Media, Component, Adjust, Transition and nested Composition materialization and
audio detachment. A placement carries an active Composition, expected revisions, a frame and an optional explicit
Track. Studio resolves the Media reference or selected package offering, computes exact time, generates identities
and submits Track creation and materialization in one guarded Project transaction. Media follows the selected
interpretation's timed duration unless the caller chooses a duration. Constant assets default to five seconds on the
View frame grid. Media placement also accepts a Picture layout and an Audio inclusion choice. Component and Adjust
durations default to their offering. Automatic placement selects an enabled,
unlocked Track of the required medium. Picture Presents use a free lane and timed Adjusts default to the end of
their medium's authored track order. An explicit Track permits deliberate Picture stacking and is checked for
medium and lock.

Media, Component and Composition placement can include `insertTracks` with an explicit destination Track in that
scope. The playhead must fall at a boundary or in empty space on each selected Track. The planner moves Items
starting at or after the playhead by the inserted duration, checks their View Group, Transition and Matte members,
and places the new Present in the same transaction.

`timeline.slip` moves a timed Media or Composition source window while preserving placement and Process Control
time. `timeline.roll` moves one direct cut on one Track by trimming both endpoints. `timeline.ripple-trim` edits
an Item's end edge and displaces subsequent Items in the selected Track scope by the exact duration change. Roll and
ripple trim require the applicable package time-window affordances. The Studio checks timed Media bounds on slip or
edge extension, and the Project checks Composition source bounds in the transaction.

Process materialization addresses an existing Present in the active Composition. The selected offering declares its
signal, Operator and closed initial parameters. Studio adds the enabled Process at the end of its signal chain or
before an explicitly addressed Process. The initial Control relation is the Present's full local interval. Inspector
observation projects the ordered chains with current enable and lock state. Enable, move and remove address a
specific Process on a specific signal and use the same guarded Project edit path as parameter edits.

A Component offering may supply closed defaults for named Component value slots. A placement uses those defaults
inline. For each offered slot the caller can explicitly link a compatible Project Shared Value or create a named
Project Shared Value from the offered default. The binding and new value are accepted in one Project transaction
with the occurrence and initial Media inputs.

Transition materialization takes two selected Present Items. Studio orders the endpoints by exact start time and
the NLE planner validates their direct cut, moves the incoming Item and adds the relation atomically. Audio detach
uses one guarded transaction to resolve or add an Audio Track and create the Audio-only occurrence from the
original Present. Media bytes and package Timeline artwork are served through Product or Project capabilities.

`observe({ kind: "component-inputs", item })` projects the package-declared slots, their constraints, current
Project Media identities and View editability. The Inspector offers compatible available assets. The
`component-media.bind` and `component-media.unbind` operations validate the current declaration and route one
occurrence edit through the guarded Surface. Component materialization accepts optional Media seeds keyed by slot.
All supplied seeds are validated against accepted Project Media before the single creation transaction.

## Package

`@hypit/nle-studio` is an independent release because it has a browser artifact, Product Provider and product lifecycle
distinct from headless `@hypit/nle`. It depends on public ProjectHost, NLE owner and Surface contracts. The Project
Media Service comes from the ProjectHost; preview and delivery remain explicit Executor dependencies whose platform
implementations are selected by the application distribution.
