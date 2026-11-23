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
  │    ├─ session navigation and Track locks
  │    └─ selected package contributions
  ├─ Studio preview Actions
  │    └─ injected HtmlFrameExecutor and HtmlVideoExecutor
  ├─ NLE Delivery Service
  │    └─ injected HtmlVideoExecutor
  └─ explicit SVML file persistence
```

The NLE session backend is the product composition root. It leases the NLE Project Service from the ProjectHost registry. The Editing Surface checks edits against session locks and forwards them to the Project Service. Closing the presenting
caller releases its Product Session lease without defining the ApplicationHost or ProjectHost lifetime.

The presenting caller mounts NLE Studio as one Product Surface. A product selector may choose among several installed
products, and the selected editor receives the viewport assigned to that Product Session.

## Lifetimes

The Project Service lives for the open SVML document and may be shared by several Product Sessions. Each session
starts at the Project's root Composition and owns its navigation and Track locks. If the active Composition is
removed, the session returns to the root. Studio assigns fixed row heights from Track roles. The edit frame grid
comes from SVML.

Selection, playhead, viewport and pending pointer gestures live only in the browser client. Refreshing the page may
discard them without touching author facts. Timeline, Canvas and Inspector scenes are rebuildable finite projections.
Timeline zoom applies the new scale and scroll offset together. The ruler and media previews use the same viewport
as the clips and playhead. Wheel zoom holds the time under the pointer. The zoom buttons and slider hold the visible
playhead, or the viewport center when the playhead is outside it. Fit scrolls to the beginning of the timeline.
A playback run starting with the playhead in view advances the horizontal viewport one page when the playhead
reaches its right edge. Manual horizontal scrolling or zooming detaches that run from the viewport. Pausing or
finishing a run preserves the current view. Seeking from the monitor or with a keyboard shortcut reveals an
offscreen target. Dragging the playhead on the ruler scrolls at the pointer's edge. The playhead and time snap
guide are clipped to the visible track area beside the fixed Track headers. The scrollable timeline starts with a
small margin before frame zero for the centered playhead handle.
In selection mode, clicking empty timeline space seeks to that horizontal position, including gaps between
tracks and space above or below them. Dragging from empty space starts marquee selection.
The Studio browser remembers the workspace split between the upper panels and the Timeline. Dragging the separator
changes both heights, with limits based on the space below the title bar. Expanded preview temporarily uses both
rows. The split is a browser preference independent of the project and track arrangement.

Media catalog entries come from the ProjectHost's one Project Media Service. NLE Media references resolve through
that collection, which is also shared with the project's other Product Sessions.

The Studio Session publishes a reusable Picture Programme for the active Composition, accepted Project revision,
edit frame rate and Media Catalog generation. The browser mounts it in a sandboxed iframe. Paused seeks and frame
steps send the target edit frame to that document. It loads the sources required at that frame and acknowledges
after the Component runtimes, media and fonts are ready and the frame has painted. During a scrub it can supersede
an outstanding seek with the latest target.

Continuous playback drives the same Programme from the browser transport. Eligible forward video runs use the
native decoder and preload the next cut. Other runs ask for the closed source samples. The Studio Session provides
short PCM buffers from the compiled Audio Programme. The browser queues adjacent buffers on its audio clock and
uses that clock to position Picture and the playhead. A silent Programme uses the browser's monotonic clock. Pause
stops the queue and presents the selected frame through the paused seek path.

Within the same Composition the mounted Programme remains visible while a replacement renders the current
playhead. The browser confirms the handoff so the Session can release the retired document and its resources.
Track-lock changes reuse the Programme. The structural Canvas provides
initial placement feedback and previews direct manipulation.

Video export is a Project-local `NleDeliveryService` Action. The Product Session starts it with the current
accepted Project revision. The selected Executor owns its FFmpeg/browser process tree. An active delivery retains a
disconnected browser Session until the Action ends or is explicitly cancelled. Explicit browser Session close
requires any unsaved document changes and active deliveries to be resolved. Application shutdown closes its Actions.
The Studio export dialog uses the Root Composition dimensions and current edit rate for MP4 delivery. It shows
Action progress, supports cancellation, and downloads the completed Project export through the session resource URL.

The browser's Media bin projects that shared catalog and displays the source duration on timed cards. The NLE
Project projection supplies the Media identities referenced by the document, including nested Compositions and
Component Media bindings, for the Added badge. A single card click shows the source in the monitor's shared
title, stage and transport. Images fit the stage as stills with disabled transport controls. Audio and video share
a source scrubber and show fractional seconds on the Media clock. Audio also seeks on the full-source waveform
drawn from the same Media source cache as the bin. The programme pauses at its own playhead. Opening a
media folder, selecting a Timeline Item or pressing Escape returns to that playhead. A Timeline seek returns to its
requested position. Adding or dragging a card to the Timeline explicitly materializes an Item at the chosen frame.
The list displays a full-width preview per asset. Video rows select frames from the shared source preview
cache, and still images repeat the same image. Both fill portrait tiles with a centered crop. During a cold
request, a strip keeps its geometry and shows the media icon. Audio rows and grid cards select the resolution of
Media waveform blocks from their available width. The browser lazily requests preview samples near the viewport
and reuses decoded blocks across Studio surfaces by Media identity and accepted source version.
The Import source also projects the shared Media library tree. Library edits publish
a separate observation invalidation, while asset references and preview resources retain their addresses. See the
[Studio API inventory](nle-studio-api.md#左上角素材区) for the current placement and import paths.
Dragging from empty space selects intersecting media and folder cards and scrolls near the viewport edges.
The selection belongs to the browser's Media bin. Source Preview keeps its own current asset.
In structural Canvas mode, an accepted
image or video resource may be shown inside its Present Item's layout as source identification. This is a direct media
resource projection, not Component or Operator evaluation and not an audiovisual preview frame.

For the [source preview cache](media.md#source-preview-cache), the NLE projection supplies the Media Asset
reference, source version and Item source-time mapping. Studio maps the visible Timeline range through that
projection and asks the Project Media Service for source samples. The Media list uses the full Media clock.
Both use the same filmstrip and waveform renderers and Action transport. A Media Item can project Picture
and Audio previews together. Its waveform fills an Audio Item and overlays the bottom of a Picture Item carrying
Audio. Materializing a video with an accepted Audio member includes that Audio by default. A detached audio
occurrence displays the waveform on its own Audio Item. Visual Items share the Media bin's neutral
tile background, visible through transparent samples. Picture cells on the Timeline use the
interpreted source aspect ratio at the strip height, bounded to 1:2 through 2:1. Sources outside those limits use
a centered cover crop. Stills repeat. Studio draws the audio envelope at fixed source-clock positions and
prefers the finest tier that covers the displayed range. The shared waveform renderer uses a cube-root scale
for peak height so quiet signals remain readable in compact bands. A coarser tier can stay visible during refinement.
When the tier changes, Studio blends the envelopes at the same source times. Recently visible Items retain
their painted previews on leaving the viewport.
Timed filmstrips use the current Timeline window and scale for both sampling and painting. Studio requests
a denser fixed source-time grid as the displayed cells cover less source time. Each cell uses the finest
available sample for its position, then a coarser or retained sample that covers the same position. A pending
cell borrows the nearest available picture on the same source clock. Resolved cells display as samples arrive.
Borrowed pictures remain presentation-only. Authored gaps and resolved transparent frames preserve their
coverage. With no picture available, the strip shows its placeholder or neutral background. An Item drag
carries a copy of its painted filmstrip through the drop until the accepted placement is available.

Composition and visual Component filmstrips both use `picture.source-preview`. The Product Session samples stable
intervals at the requested density and captures a representative frame on the edit grid. A Composition uses its
own clock, canvas and internal processing. The parent Item's source-time mapping selects intervals. A Component uses
its placed Item's window on the owning Composition clock, including its exact source mapping and Item-local controls.
The renderer supplies the Component's own Picture aspect ratio. The Timeline applies the same aspect bounds to
Media, Composition and Component sources. A fixed Component Picture covers the whole Item with one sample.
Text and subtitle Items show their authored content as a compact label. Filter and effect Items use the same
compact layout and show the Item title. Studio uses a palette for filters, `fx` for effects and overlapping circles
for transitions across the catalog and their corresponding Timeline roles or cut controls. The Assets tab uses a
clapperboard for the library. Media thumbnails identify the kind of each file.

Studio maps text, subtitle, filter and effect roles to amber, mist violet, gray-green and plum clip fills.
Each theme pairs the fills with a readable label color. A neutral outline and trim handles identify the
selection. Track icons and Item labels also identify the roles.

Requests are validated against the current Project revision and Media Catalog generation. The compiler selects an
entry within the authored Project so contributions retain the Project context. The session fingerprints the resulting
HTML Picture program and staged resource identities. Equivalent inputs reuse the same PNG samples across revisions.
Each document covers up to 120 sampling intervals. A bounded set of capture pages opens on demand and closes after
idle. Captured frames preserve alpha. An uncovered interval, a capture error and a pending sample have distinct
results. The browser caches each successfully decoded block, including when another resource in the same Action fails.

A Composition occurrence with an Audio appearance and a child Audio output uses `audio.source-preview`.
Studio compiles the child's Audio programme and the local Media executor measures the mixed PCM on the child's
clock. The session caches numeric envelope blocks by compiled programme, source file versions, resolution and
block index. Occurrences select blocks through their source-time mappings. Occurrence placement and parent Audio
processes apply to playback separately from the shared source waveform. The waveform is painted by the same
browser renderer as Media waveforms. A child with audio tracks and an empty picture canvas can be placed on a
Picture Track and contributes a transparent picture.

Media, Composition and Component Picture Items share the same background and overlaid label row. The label row
places separate badges for group membership and nested Composition navigation before the projected Item title and
duration. Labels take their natural widths in order and are clipped at
the Item's right edge. The Picture preview occupies the Item body and a source waveform can overlay its bottom edge.

The session assembles NLE Component definitions, authoring and Inspector presentation contributions from the
ProjectHost's already selected Package Environment. The NLE contracts validate and index those process-local
capabilities; ProjectHost does not interpret them. NLE Studio additionally owns the finite `hypit.nle-component`,
`hypit.nle-process`, `hypit.nle-adjust` and `hypit.nle-transition` catalog contracts used by its text, subtitle, picture, filter,
effect and transition creation surfaces. Each Component definition assigns its symbol one Track role, states its readable
source time, and supplies a `readText` function for text and subtitle. Offerings for the same symbol share that role. An Adjust offering
declares a `filter` or `effect` role. The filter role
selects the Picture medium and the Filters browser. Adding a filter to the timeline materializes a named Adjust;
dropping it on an editable Picture Present uses that same recipe as a Present-local Process.
Selecting an entry invokes the matching NLE materialization planner. The package owns
the exact Component or Operator symbol, closed initial parameters and declared defaults; it does not return arbitrary
Project commands.

Inspector contributions may project finite scalar fields and stable row collections. Every field id remains unique
within its section, so the browser submits only section, field and value; it never receives array indexes, JSON paths
or package functions. The backend resolves that field against the selected package's exact symbol and asks its pure
authoring reducer for replacement closed parameters. Package contributions cannot create Tracks, choose transaction
boundaries or persist interface state. The Timeline reads the placed Track's role directly. Text and subtitle labels
use the Component's plain text projection of its authored parameters. Filter and effect labels read the Item name.
Studio uses the same trim and split gestures for Media, Components and nested Compositions. Readable source time
determines how far the trim handles can extend. Attached Processes and standalone Adjusts require Operator support
for slicing their existing Control relation.

A collection row may also declare actions. The browser submits the Item, section, collection, row and action
addresses with both revisions. The backend projects the current row again and runs the same guarded authoring
reducer used by scalar edits.

The Inspector separately projects NLE-owned ownership controls for existing Component value slots. An inline slot can
be shared or linked; a shared slot can be rebound or unlinked by copying its resolved value inline. These operations
change only explicit Item bindings and Project Shared Values and therefore use the same Project revision, session locks
and invalidations as every other Project transaction. The package contributes the slot's value semantics, not the
ownership transaction or its UI.

## Local protocol and persistence

Timeline dragging supplies selected Items, an anchor Item, a frame delta and a Track or gap. While the pointer is
down, `observe({ kind: "timeline-drop", drop })` runs the same planner against the current revisions and returns the
destination Track or gap for the highlight. Releasing the pointer submits `timeline.drop` through `POST /api/operate`. Studio follows Composition Groups and connected Transition and Matte
endpoints, computes one exact time displacement and keeps each source lane together in relative visual order.
It searches compatible unlocked Tracks with room for the moved Items and allocates new ones when needed. A gap drop
of every Item on a contiguous block moves those Tracks together to that gap. Dropping inside the block keeps its
order. Studio displays the Composition Track list from top to bottom. Track-header reordering and gap placement
translate that order into SVML Track commands. Project Track and Item edits commit as one guarded transaction.

The Timeline also submits trim, split and remove through `operate`. Split cuts the selected Items that cross
the playhead and commits them together. Group membership follows split pieces. Remove deletes the explicit selection,
its incident audiovisual relations and affected Group memberships.

Direct movement and edge gestures take their final position on pointer release. Studio queues completed gestures
in order and submits each with the current accepted Project revision. Item and Process edge drafts stay visible
until their operations settle. Inspector reads run independently of that queue. An observed external Project
change invalidates gestures authored against the preceding view.

The selected edge-aligned Process has a Control interval drawn within its Present on the Timeline. The inner
handle and the Inspector duration field both submit `process.timing` with the exact Process address and edit-frame
duration. Inspector also selects the alignment. The browser keeps the selection and drag draft for the Session.

Callers can close a gap at a frame or ripple-remove a contiguous selection by naming the Tracks to move.
The planner resolves the exact gap edges and shifts following Items once. It rejects an occupied gap and any
edit whose linked members would need to move outside the named Tracks or across the gap boundary.

Studio's session clipboard holds explicitly selected Items, exact relative placements and complete Transition,
Matte and Group membership within one NLE document. Paste creates new Item and relation identities at the
playhead. It reuses the original Tracks if their current ordering, locks and occupied Picture ranges permit it,
or creates a new ordered set of Tracks in the active Composition. Items and complete copied relations and Groups
commit in one Project transaction.

The Timeline toolbar creates a compound directly from a contiguous selection of Present Items with enabled content
on one enabled, unlocked Track and all members of affected relations and Groups.
The backend moves the selected Items, complete audiovisual relations and complete Groups into a child with the same
canvas and rebases their exact time. The parent occurrence occupies the selection's original paint position. Make-unique copies the
referenced Composition tree and retargets the selected occurrence. Its Project Media and Shared Value references
remain explicit shared references. Explode inserts a fresh copy of the children in the parent at the occurrence's
position when the source has one matching Track and the occurrence is full-duration with identity time and layout.
An exploded Group is copied with fresh member IDs. If the occurrence belongs to a parent Group, the inserted Items
join that Group. The source definition remains available to its other occurrences.

The tab bar lists the Project's Compositions. Its add button creates and opens a Composition. Each tab's menu renames
or resizes its Composition, selects it as the Project Root, or deletes an unreferenced Composition other than the Root.
The menu can place the tab's Composition as a referenced Present at the active timeline's playhead. Studio offers
insertion for enabled audiovisual content when the reference is acyclic. Creating a copy opens a new Composition with
its own copied nested definitions, Tracks, Items, and relations. Media and Project Shared Value references stay shared.
Selecting another tab opens it directly and starts a fresh navigation path.
Double-clicking a Composition occurrence opens its source and records the parent's playhead in the Studio Session.
Returning restores that frame.

The loopback server serves the client build opened with its Studio adapter and same-origin JSON operations for
finite observation, guarded Surface commands, save and reload. `POST /api/observe` accepts the Product Session's
finite observation union. Initial `open` contains
status, Timeline, Canvas, Composition navigation, Item-to-Media projection, Media, Catalog, Preview and delivery
availability without embedding either complete owner document. Inspector is another keyed observation. The protocol is a product
adapter carries the Project revision.

Every accepted mutation returns one compact receipt containing current Project status, whether the Project changed, invalidated
projection names and an optional result address. The browser retains unaffected projections and rereads only the
invalidated Timeline, Canvas, Media, Catalog, Preview or delivery observation. Inspector is reread only for the
selected Item when invalidated. `GET /api/events` streams NLE Project and Studio session changes, Project Media Catalog
generations and Action progress. The browser rereads the finite open projection on connect or reconnect and
rereads invalidated projections on live edits.

`POST /api/actions` starts a frame preview, playback preview or delivery. `GET /api/actions/:handle` or
`observe({ kind: "action", handle })` reads current state. `DELETE /api/actions/:handle` requests cancellation.
A completed Action exposes a Session resource URL. Frame preview captures an exact PNG for callers requesting a
single image. The playback preview Action produces an exact MP4 review interval with programme audio.

The Preview observation includes the active Composition's Picture Programme URL. The session adapter serves
`api/programme/:generation/index.html` and scoped media, source frames, and `audio/:frame.wav` buffers under the
same generation. The browser sends paused seeks and continuous play frames through the document's message channel.
After a paused seek paints, the browser receives an acknowledgement and
uses `POST api/programme/:generation/activate` to confirm the visible generation.

The same endpoint starts `media.source-preview`, `media.thumbnail`, `media.storyboard`, `media.waveform` and `media.audio-preview` against
one accepted Asset identity and Catalog generation. These operations sample the Asset's Media clock. Project Media retains
a bounded set of result resources within each view lease.
Delivery accepts a portable destination validated by its Service. Source Preview uses the selected Project Media
resource and its local media clock. Both preview modes display timecode at the current edit rate and provide a seek
bar in the standard and expanded monitor. Seeking the Programme pauses playback and moves the Timeline playhead.
Seeking a source moves only the source playhead.

Within the Product Session mount, `POST api/media/import?name=...` carries one raw browser `File` body. The adapter
streams it to an invocation-local temporary file, calls the Node Project Media Service's adoption Action with bounded
container-index inspection, then
removes the temporary file. Multiple selected files are separate sequential requests. The route returns the refreshed
Media identity in its receipt and invalidates the Media projection. Media identity remains the resulting
project-relative Media Asset manifest path. This transport does not place the accepted Media into the NLE document.

The browser requests a save after accepting an edit to a durable document. Studio serializes saves and reloads for
the shared Project document. A save compares the file with the bytes last accepted by its Owner Provider, atomically
replaces that file and marks the exact Service revision saved after the write succeeds. If another program modifies
the file, Studio retains the open edit and reports the save conflict. The notice offers to use the file version
and asks for confirmation before discarding unsaved edits and clearing undo history.
The title bar shows the latest write time of the accepted SVML file. The Node
document adapter tracks the timestamp alongside the accepted bytes. Studio projects it on open and updates it
after saves and reloads. A save conflict has a separate notice with an action to reopen the conflict dialog.

The `operate` union also accepts Media, Component, Adjust, Transition and nested Composition materialization and
audio detachment. A placement carries an active Composition, expected revisions, a frame and an optional explicit
Track. Studio resolves the Media reference or selected package offering, computes exact time, generates identities
and submits Track creation and materialization in one guarded Project transaction. Media follows the selected
interpretation's timed duration unless the caller chooses a duration. Constant assets default to five seconds on the
SVML edit frame grid. Media placement also accepts a Picture layout and an Audio inclusion choice. Component and Adjust
durations default to their offering. Automatic placement selects an enabled,
unlocked Track with the required medium and role. Presents use a free lane, and timed Adjusts use a Track with their
offering's role at the end of their medium's authored order. Component placement writes the offering title as
the Item name. Moves and copies keep each Item's originating Track role and medium. Text, subtitle, filter and
effect rows use the same compact height.

Media, Component and Composition placement can include `insertTracks` with an explicit destination Track in that
scope. The playhead must fall at a boundary or in empty space on each selected Track. The planner moves Items
starting at or after the playhead by the inserted duration, checks their Group, Transition and Matte members,
and places the new Present in the same transaction.

The Timeline observation publishes each eligible trim handle's admissible edit-frame range. The Studio planner
uses the resolved Media Catalog, Composition duration or package source-time declaration, together with the current
source and Process mappings. The handle clamps to the range while dragging. A trim command checks the edit against
the current bounds, and the Project transaction validates structural relationships at commit.

`timeline.slip` moves a timed Media or Composition source window while preserving placement and Process Control
time. `timeline.roll` moves one direct cut on one Track by trimming both endpoints. `timeline.ripple-trim` edits
an Item's end edge and displaces subsequent Items in the selected Track scope by the exact duration change. Roll and
ripple trim require the applicable package time-window affordances. Roll and ripple trim check the affected edge
windows together with the transaction's other changes.

`timeline.retime` sets a rational source rate on a Media or Composition Present with a single affine source window.
A Present carrying Audio supports positive rates. A Picture-only Present also supports reverse. Placement, duration
and Process Control time stay fixed. The new window must fit inside the resolved source duration. Reversing
direction uses the previous source window's other edge. `media.freeze` reads a forward Media Picture sample from an existing
Present and creates a timed Picture-only hold with the same layout. It accepts sampled Media Pictures without
enabled Picture Processes.

Process materialization addresses an existing Present in the active Composition. The selected offering declares its
signal, Operator and closed initial parameters. Studio adds the enabled Process at the end of its signal chain or
before an explicitly addressed Process. The initial Control relation is the Present's full local interval. Inspector
observation projects the ordered chains with current enable and lock state. Enable, move and remove address a
specific Process on a specific signal and use the same guarded Project edit path as parameter edits.

A Component offering may supply closed defaults for named Component value slots. A placement uses those defaults
inline. For each offered slot the caller can explicitly link a compatible Project Shared Value or create a named
Project Shared Value from the offered default. The binding and new value are accepted in one Project transaction
with the occurrence and initial Media inputs.

Transition materialization takes two selected Present Items or a frame and an explicit Picture Track. Studio
resolves the direct cut and adds its overlap and relation atomically. Resizing adjusts the incoming position and
checks related Items and the resulting overlap. Replacing a Transition selects a package offering while keeping the
overlap unless the caller also supplies a duration. The Transition Inspector edits finite package fields through
the installed reducer. Removing the relation preserves both endpoint placements. Audio detach creates an Audio-only
occurrence with the original source and time mapping. Studio creates a dedicated Audio Track immediately below the
original Picture Track and inherits its enablement. A caller can explicitly select a destination Audio Track.
Track creation and audio detachment commit in one guarded transaction. Media and preview bytes are served through
Product or Project capabilities.

`observe({ kind: "component-inputs", item })` projects the package-declared slots, their constraints, current
Project Media identities and session editability. The Inspector offers compatible available assets. The
`component-media.bind` and `component-media.unbind` operations validate the current declaration and route one
occurrence edit through the guarded Surface. Component materialization accepts optional Media seeds keyed by slot.
All supplied seeds are validated against accepted Project Media before the single creation transaction.

## Package

`@hypit/nle-studio` is an independent release because it has a browser artifact, Product Provider and product lifecycle
distinct from headless `@hypit/nle`. It depends on public ProjectHost, NLE owner and Surface contracts. The Project
Media Service comes from the ProjectHost; preview and delivery remain explicit Executor dependencies whose platform
implementations are selected by the application distribution.
