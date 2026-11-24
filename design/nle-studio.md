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
small margin before frame zero for the centered playhead handle. The Timeline contains horizontal overscroll at both
ends. Studio's document also contains horizontal overscroll over toolbars and other editor surfaces, so an editor
gesture ends at the scroll boundary without starting browser history navigation.
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
Track-lock changes reuse the Programme. The monitor selects the topmost active Item under the pointer using
its projected frame. A drag sends a temporary move or proportional resize to the visible Programme's placement
elements. The monitor owns the pointer draft and leaves other panels visually active while the edit commits.
Corner handles keep the opposite corner fixed and use the cursor matching their diagonal. The last accepted Programme stays visible through commit until the new Programme paints the same
playhead. For a rasterized Programme, the outline tracks the draft and the painted frame updates at handoff.

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
requested position. The Media card's add button and double-click place the asset on a new top Track at the
current playhead using the same placement operation as an operating-system file drop after import.
An asset drag begins with a compact card. On entering the editable Timeline, the drag presents a floating Item
until pointer release or cancellation. Media drops and existing Item moves share the Timeline hit geometry for
time, Track rows and gaps. The floating Item uses the Media source clock and keeps its shape over blocked
destinations. A gap shows the Track insertion guide, and a cut insertion shows its displaced suffix. Release
validates the destination and retains the floating Item until the accepted Item appears.
Dropping files from the operating system into the Media bin imports them into the open library folder.
Dropping files into the Timeline imports them into the library root and places the accepted Media at the
playhead frame captured on release. Studio submits one NLE edit with those Media references. The edit
creates one new Track per media role at the top of the Timeline and lays that role's Items end to end in
drop order. Picture sits directly above Audio when both are added. Both start at the captured frame, and
audiovisual Items keep their audio on the Picture Track. Undo
reverts the Timeline edit. Imported Media retain their independent Project lifetime.
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
While the first Programme frame loads, an accepted
image or video resource may be shown inside its Present Item's layout as source identification. This is a direct media
resource projection, not Component or Operator evaluation and not an audiovisual preview frame.

For the [source preview cache](media.md#source-preview-cache), the NLE projection supplies the Media Asset
reference, source version and Item source-time mapping. Studio maps the visible Timeline range through that
projection and asks the Project Media Service for source samples. The Media list uses the full Media clock.
Both use the same filmstrip and waveform renderers and Action transport. A Media Item can project Picture
and Audio previews together. Its waveform fills an Audio Item and overlays the bottom of a Picture Item carrying
Audio. Materializing a video with an accepted Audio member includes that Audio by default. A detached audio
occurrence displays the waveform on its own Audio Item. Filmstrips paint a subtle checkerboard behind each drawn
Picture sample to show its transparent pixels. Media cards use the same backdrop within the fitted picture bounds.
Empty cells and margins retain their neutral background. Sampled resources retain their alpha. Picture cells on the Timeline use the
interpreted source aspect ratio at the strip height, bounded to 1:2 through 2:1. Sources outside those limits use
a centered cover crop. Stills repeat. Studio draws the audio envelope at fixed source-clock positions and
prefers the finest tier that covers the displayed range. The shared waveform renderer uses a cube-root scale
for peak height so quiet signals remain readable in compact bands. A coarser tier can stay visible during refinement.
When the tier changes, Studio blends the envelopes at the same source times. Recently visible Items retain
their painted previews on leaving the viewport.
Timed filmstrips and waveforms use the current Timeline window, including a trim in progress. Media and
Composition previews slice the projected source clock with the same time mapping rules as the committed trim.
A Component's preview can hold the frame at its committed edge while the extended window is being edited.
Studio requests
a denser fixed source-time grid as the displayed cells cover less source time. Each cell uses the finest
available sample for its position, then a coarser or retained sample that covers the same position. A pending
cell borrows the nearest available picture on the same source clock. Resolved cells display as samples arrive.
Borrowed pictures remain presentation-only. Authored gaps and resolved transparent frames preserve their
coverage. With no picture available, the strip shows its placeholder or neutral background. An Item drag
carries a copy of its painted filmstrip through the drop until the accepted placement is available.

Composition and visual Component filmstrips use `picture.source-preview`. The Product Session samples stable
intervals at the requested density and captures a representative frame on the edit grid. A Composition uses its
own clock, canvas and internal processing. The parent Item's source-time mapping selects intervals. A Component uses
its placed Item's window on the owning Composition clock, including its exact source mapping and Item-local controls.
The renderer supplies the Component's own Picture aspect ratio. The Timeline applies the same aspect bounds to
Media, Composition and Component sources. A fixed Component Picture covers the whole Item with one sample.
A Transition occupies the exact overlap of its two Picture Items on their Track. Studio overlays a selectable band
over the overlap, with the same tint on both sides of the midpoint separating the Items' existing filmstrips.
Both filmstrips retain their scale and source clock. The midpoint is presentation geometry. The programme preview
evaluates the authored Transition from the exact start of the overlap through its end.
The band uses the Picture Item label row for the Transition name and overlap duration. Clicking the band selects
the Transition and opens its Inspector at the current playhead position. Rejected edits report their error in a
non-modal notice and keep the selection available for inspection. Clicking empty Timeline space or pressing Escape
clears the selection and returns Item focus to the Timeline surface. An active gesture consumes Escape first.
Text and subtitle Items show their authored content as a compact label. Filter and effect Items use the same
compact layout and show the Item title. Studio uses a palette for filters, `fx` for effects and overlapping circles
for the Transition catalog. The Assets tab uses a
clapperboard for the library. Media thumbnails identify the kind of each file.

Studio maps text, subtitle, filter and effect roles to amber, mist violet, gray-green and plum clip fills.
Each theme pairs the fills with a readable label color. A rounded outline and short trapezoid grips centered on
the edges identify the selection. The grips use a dark outline and light fill in both themes. Each grip's hit area fits
inside its Item's projected time span. Narrow Items yield space to direct selection and movement. Handle hit
testing follows Track Item stacking. Track icons and Item labels also identify the roles.

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

Media, Composition and Component Picture Items share the same background and overlaid label row. The fixed-size
badges appear in this order: nested Composition, Matte, Group membership. Matte content uses a half-filled circle,
and the Matte source uses a dashed circle. Selecting either endpoint outlines the directly related Items.
On one eligible Picture Present, the clip context menu starts Matte source selection for that Item.
The Host lists Picture Presents that cover the content time range and satisfy the relationship rules and current
Track locks. During source selection, every timeline object uses the same display states for the current content,
eligible sources and ineligible objects. Only IDs returned by the Host are eligible sources.
Selecting a compatible Timeline Item sets or replaces the selected Item's source. Clicking Timeline
space or an ineligible Item dismisses the picker and preserves the selection and playhead. Clicking outside the
Timeline editing area, pressing Escape or using the prompt's cancel control also exits source selection.
The menu for a single content Item with an existing Matte can replace its source or remove its Matte.
This addresses the Matte for the selected content even when it also supplies a source to other Items.
Replacing or removing the Matte requires both current endpoints to be unlocked. Binding and removal each commit
one guarded Project transaction and preserve both Items' placement.
The clip context menu links the selected Items when every touched Group is fully selected. A selection within
one Group unlinks just those members, including dissolution when the remaining membership falls below two.
Selecting an entire Group unlinks all of its members. Group commands respect the session's Track locks.
Command or Control with G applies the link action. Adding Shift applies the unlink action.
The projected Item title and duration follow the badges. Labels take their natural widths in order and are clipped
at the Item's right edge. The Picture preview occupies the Item body and a source waveform can overlay its bottom edge.

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
Studio uses the same trim and split gestures for Media, Components, nested Compositions and Adjusts. Readable
Source or Control time determines how far the trim handles can extend. NLE slices attached Process Control
relations as part of the Item edit.

A collection row may also declare actions. The browser submits the Item, section, collection, row and action
addresses with both revisions. The backend projects the current row again and runs the same guarded authoring
reducer used by scalar edits.

The Inspector separately projects NLE-owned ownership controls for existing Component value slots. An inline slot can
be shared or linked; a shared slot can be rebound or unlinked by copying its resolved value inline. These operations
change only explicit Item bindings and Project Shared Values and therefore use the same Project revision, session locks
and invalidations as every other Project transaction. The package contributes the slot's value semantics, not the
ownership transaction or its UI.

## Local protocol and persistence

Timeline dragging supplies selected Items, an anchor Item, a frame delta and a Track or gap. Nearby opposing edges
on the destination Track take priority when snapping. Studio sends the two Item identities for this alignment and
resolves the displacement from their exact NLE times, including boundaries between edit frames. While the pointer is
down, `observe({ kind: "timeline-drop", drop })` runs the same planner against the current revisions and returns the
destination Track or gap for the highlight. The browser draws the time guide from its current snap target. A held
target has a larger release distance than its acquisition distance, both measured in screen pixels. Releasing the
pointer submits `timeline.drop` through `POST /api/operate`. Studio follows Composition Groups and connected Transition and Matte
endpoints, computes one exact time displacement and keeps each source lane together in relative visual order.
It searches compatible unlocked Tracks with room for the moved Items and allocates new ones when needed. A gap drop
of every Item on a contiguous block moves those Tracks together to that gap. Dropping inside the block keeps its
order. Studio displays the Composition Track list from top to bottom. Track-header reordering and gap placement
translate that order into SVML Track commands. The Track header drag carries a snapshot of the row with its
current filmstrips and waveforms. The dragged row's center determines the highlighted insertion boundary. A
released reorder immediately updates the displayed rows and enters the same queue as Item and tab moves.
Project Track and Item edits commit as one guarded transaction.

Every Track header shows the role, lock, eye and speaker in the same four slots. The eye is enabled on Picture
Tracks. The speaker is enabled on Audio Tracks and Picture Tracks carrying Audio. An available switch that is off
shows its alternate icon in the accent color. A signal absent from the Track shows a minus within its icon. Each switch
writes its corresponding SVML Track signal and updates the Programme. The lock protects edits to the Track within
the current Studio Session and disables its signal controls.

An Item's context menu offers a one-layer reorder when a same-Track Item intersects its exact time interval.
The requested direction finds the nearest intersecting Item in authored stack order, stopping at Transition
participants. The operation places the clicked Item immediately above or below that neighbor in SVML order.
Abutting intervals offer no stack action. Reorder only changes the Item list and uses Project undo and redo.
Right-clicking a selected Item addresses the editable selection. Right-clicking another Item addresses that Item
alone. The menu offers audio detachment, freeze, Group and Matte editing, and compound creation according to
that selection and the playhead.

The Timeline also submits trim, split and remove through `operate`. Split cuts the selected Items that cross
the playhead and commits them together. Group membership follows split pieces. Remove deletes the explicit selection,
its incident audiovisual relations and affected Group memberships.
An edit that leaves a previously occupied Track empty removes it from the document in the same transaction.
Undo restores the Track and its original position along with the Item edit.

Direct movement and edge gestures take their final position on pointer release. Studio queues completed gestures
in order and submits each with the current accepted Project revision. The visible position of a submitted Item move
can start another move while the receipt is pending. Studio resolves that next position against the Item in the
latest accepted scene. Small vertical motion during a horizontal drag keeps the Item on its Track. Out-of-bounds
and incompatible targets show a dimmed draft and clear the placement guide. Item and Process edge drafts stay
visible until their operations settle. Inspector reads run independently of that queue. An observed external
Project change invalidates gestures authored against the preceding view.

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

The clip context menu groups compound creation, entering the inner Timeline, making the inner Timeline independent
and exploding the occurrence. The `composition-actions` observation uses the same planners as the edits and
reports a blocked command's diagnostic.

Compound creation moves explicitly selected Present Items on unlocked Tracks into a Composition with the
same canvas. All affected Transitions, Mattes and Groups move with their full membership. Track order, Item order,
relative time and gaps are preserved. The parent uses one full-duration identity-time occurrence. Creation and
explode use the same placement rule for a replacement Item or ordered Track block. Overlapping outside Picture
contributions and Audio Adjusts constrain its position according to their original processing order. Multiple
selected Tracks create a parent Track at a valid boundary.

Make-unique copies the referenced Composition graph once per reachable definition and retargets the selected
occurrence in one edit. Its placement, time, layout, relationships, Project Media and Shared Value references
stay with the occurrence. Explode replaces a full-duration occurrence with identity time and layout with a fresh
copy of the inner Track contents, preserving their order and placing their times relative to the outer start.
The expanded Tracks preserve the effective Picture and Audio switches and may contain Presents with local Processes. An active outer
Process, outer Transition or Matte, or an inner Adjust blocks the edit. Expanded audiovisual relationships receive
fresh IDs. If the occurrence belongs to a parent Group, the expanded Items take its place in that Group.
Otherwise its copied inner Groups retain their separate membership. The source definition remains available in
the Project.

The tab bar follows SVML Composition order. Dragging a tab by its name reorders it at the marked boundary
and writes one `composition.move` transaction with Project undo and redo. The insertion guide and release use
the same drop area, which includes a margin above and below the tab bar. Released moves immediately update the
displayed order and enter the gesture queue. The active Composition and Root are selected by ID.
Dragging near the edge of an overflowing strip scrolls it horizontally. At either end of the strip,
the pointer can target the first or last slot directly. The divider and add button stay beside the strip. Dropping over
them appends the tab. Clicking the add button creates and opens a Composition.
Each tab's menu renames or resizes its Composition, selects it as the Project Root, or deletes an unreferenced
Composition other than the Root.
The menu can place the tab's Composition as a referenced Present at the active timeline's playhead. Studio offers
insertion for enabled audiovisual content when the reference is acyclic. Creating a copy opens a new Composition with
its own copied nested definitions, Tracks, Items, and relations. Media and Project Shared Value references stay shared.
Selecting another tab opens it directly and starts a fresh navigation path.
Entering a Composition occurrence from the clip menu or by double-clicking evaluates its exact source-time map
at the parent playhead. A frame outside its window or an uncovered interval enters at its first readable position.
The Studio Session records the parent's playhead and restores it on return.

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
durations default to their offering. Automatic placement selects an unlocked Track with the required medium and role. Presents use a free lane, and timed Adjusts use a Track with their
offering's role at the end of their medium's authored order. Component placement writes the offering title as
the Item name. Moves and copies keep each Item's originating Track role and medium. Text, subtitle, filter and
effect rows use the same compact height.

Media, Component and Composition placement can include `insertTracks` with an explicit destination Track in that
scope. The playhead must fall at a boundary or in empty space on each selected Track. The planner moves Items
starting at or after the playhead by the inserted duration, checks their Group, Transition and Matte members,
and places the new Present in the same transaction.

The Timeline observation publishes each eligible trim handle's admissible edit-frame range. The Studio planner
uses the resolved Media Catalog, Composition duration or package source-time declaration, together with the current
source and Process mappings. An ordinary trim can extend as far as the first occupied time on the same Track.
At an abutting edge or an overlap, the same handle can still shorten the Item. Transition timing owns the
outgoing end and incoming start. Handles clamp to the current edit-frame range while dragging. The Inspector
uses the same ordinary trim operation. The `timeline-cuts` observation takes the selection and playhead at an
expected Project revision. It returns the Items whose windows strictly contain that time and the availability
of splitting or shortening the entire set. Each trim batch validates the resulting windows together, so both
ends of a Matte can shorten in one edit while preserving coverage. Trim keeps Group membership. Splitting
requires every addressed Item to be writable and free of Transition and Matte relationships, and both pieces
inherit the original Item's Group. Each successful cut batch has one undo step.

`timeline.slip` moves a timed Media or Composition source window while preserving placement and Process Control
time. `timeline.roll` moves one direct cut on one Track by trimming both endpoints. `timeline.ripple-trim` edits
an Item's end edge and displaces subsequent Items in the selected Track scope by the exact duration change.
Roll and ripple trim check the affected edge windows together with the transaction's other changes.

`timeline.retime` sets a rational source rate on a Media or Composition Present with a single affine source window.
A Present carrying Audio supports positive rates. A Picture-only Present also supports reverse. Placement, duration
and Process Control time stay fixed. The new window must fit inside the resolved source duration. Reversing
direction uses the previous source window's other edge.

`media.freeze` samples a forward Media Picture at the playhead and inserts a Picture-only hold on its Track. The hold
uses the original Media and layout with a zero-rate source mapping. Its default length is three seconds rounded to
the edit-frame grid. At an interior frame, the edit splits the source and keeps the left piece fixed. At the first
frame, the whole Item follows the hold. The right piece and the same-Track suffix move later by the hold length.
The planner resolves the moving set in the state after the planned split. It expands the same-Track suffix
through Group, Transition and Matte links, and checks it against the fixed same-Track prefix, Track locks
and new overlap with stationary Items. A split that brings its own left piece into the moving set through
its inherited Group fails the fixed-prefix check. The source Item must be enabled and have
no active Picture Processes. For a single selected Media Picture, Studio projects availability for the default
hold length through `timeline-cuts`. A blocked insertion returns the planner's diagnostic for the menu.
The Inspector shows a held timed Picture at zero speed. Split, displacement and insertion commit together
and share one undo step.

Process materialization addresses an existing Present in the active Composition. The selected offering declares its
signal, Operator and closed initial parameters. Studio adds the enabled Process at the end of its signal chain or
before an explicitly addressed Process. The initial Control relation is the Present's full local interval. Inspector
observation projects the ordered chains with current enable and lock state. Enable, move and remove address a
specific Process on a specific signal and use the same guarded Project edit path as parameter edits.

A Component offering may supply closed defaults for named Component value slots. A placement uses those defaults
inline. For each offered slot the caller can explicitly link a compatible Project Shared Value or create a named
Project Shared Value from the offered default. The binding and new value are accepted in one Project transaction
with the occurrence and initial Media inputs.

Transition materialization takes two selected Present Items or a frame and an explicit Picture Track. The Timeline
projects eligible direct cuts for catalog drops. The catalog can also apply a Transition to a selected pair or to
one eligible cut at the playhead. Dropping on an existing Transition band replaces that relation. For creation,
Studio seeds the displacement with the incoming Item and all Items starting at or after it on the same Track.
It follows Group, Matte and existing Transition links to include their other members, including linked Items on
other Tracks. The outgoing Item and the earlier Items on its Track are fixed. Studio checks locks, Programme time
zero and new intersections with stationary Items, allowing the selected endpoint pair to overlap. It moves the
whole set earlier by the Transition duration and adds the relation in one transaction. Deletion uses the same
right-side scope with the relation being deleted excluded from the links. It displaces the set later by the exact
current overlap to restore endpoint adjacency, then commits both changes together. If a required Item is fixed,
locked or would overlap a stationary neighbor, the operation reports the blocker and leaves the transaction unapplied.
Resizing adjusts the incoming position and checks related Items and the resulting overlap. Replacing a Transition
selects a package offering while keeping the overlap unless the caller also supplies a duration. The Transition
Inspector edits finite package fields through the installed reducer. Audio detach creates an Audio-only
occurrence with the original source and time mapping. Studio creates a dedicated Audio Track immediately below the
original Picture Track and inherits its Audio switch. A caller can explicitly select a destination Audio Track.
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
