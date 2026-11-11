# `@hypit/workbench`

Browser work surfaces for one selected Hypit project. The direct `hypit.nle@1` editor lives at
`/nle`; the Generation Canvas for one `hypit.generation-workspace@1` document lives at `/canvas`.
`/3d` presents one project-owned `hypit.scene@1` document through its independent
`hypit.scene-view@1` editor projection. It does not use the NLE Project as a 3D scene store.

The Workbench is independent of Hypit Desktop. A local Host may bind an OS-assigned loopback
port and open the same URL in an ordinary browser or a Desktop content tab. Ports and URLs are
Host transport details and never become project identity.

```bash
hypit workbench edit.nle.json
hypit workbench generation.workspace.json
hypit workbench shot.scene.json
hypit workbench edit.nle.json generation.workspace.json shot.scene.json
```

Passing several documents mounts their independent Hosts at one origin. Comments use the NLE Host's
programme and identify the reviewed document in the project Feedback file. Each Host resolves the
project root of its own document. Sharing an origin therefore does not establish that the Canvas
and the timeline use the same media directory. The top bar currently offers all four tabs even when
the invocation opened only one document. See the [suite router](src/node/suite-server.ts) and
[navigation](src/client/topbar.js).

The local NLE Host opens the Project as an `NleEditSession` and opens or creates the sibling
`*.nle-view.json` Timeline View. Composition edits are ordinary revisioned `@hypit/nle` transactions;
the editor grid, Track locks and Groups use independent `@hypit/nle-view` transactions. Undo and redo remain
Project session state, while Save publishes both documents. The Host projects Project, View and transient observations into an
`NleTimelineScene`; the browser renders that finite scene and owns only Session interaction. It does not contain an Electron
bridge, Runtime, Provider, Result repository or legacy Studio/SVML recovery path.

The Comments surface reviews the same programme and persists project-wide notes in
`<projectRoot>/feedback/project.feedback.json` (`hypit.feedback@1`). Every note names the explicit project-relative
document context and a time in seconds. The file is a review authority independent of the NLE Project
and Timeline View; filters, selection, drafts and playhead remain browser Session state. Mutations
re-read the real file and reject stale replacements instead of overwriting Agent or external edits.
Plain emoji stay in comment text. Pasted, selected or dropped reaction images and screenshots are
stored under `feedback/attachments/` and referenced by the comment; they never enter the production
`media/` library merely because they were used in review.

Current NLE presentation exposes the real Project, the shared project `media/` asset bin, Tracks, Items, selection inspector,
single-frame Item nudging, Track mute/lock, undo, redo and save. File-backed Media Items receive
invocation-local image, source-time-sampled storyboard or waveform observations through an in-memory
Workbench cache; neither the bytes nor their routes enter the Project or Timeline View. The monitor derives
the exact HTML and audio programmes from the current Project using the installed packages' terminal facets,
then binds project materials to invocation-local URLs. Browsers play the linked programme directly; when the
browser audio adapter cannot execute the selected streams or maps, Workbench materializes that closed audio
programme once as an invocation-local WAV. Derived programmes, documents and cache paths never enter the
Project or Timeline View. Installed packages also contribute their own finite parameter-editor declarations.

For Component and Adjustment Items, the CLI loads only installed packages named by exact NLE Module symbols and
collects their optional `hypit.nle-timeline-presentation@1` facets. Packages may describe factual title/text,
static or Item-specific poster bytes, and finite tone/chrome tokens; Workbench still owns resource URLs, caching,
DOM and CSS. A missing optional package presentation falls back to
the generic Item projection, while an installed malformed package remains an error instead of being silently hidden.

The Canvas presentation reads the real Generation Graph and its independent Generation Workspace. It derives
recipe edges through `@hypit/generation-canvas`, persists Workspace transactions such as `node.move`, and submits Graph
transactions for model switches, literal edits and disconnections. The Host asks the installed node packages to
inspect every affected node and its downstream dependants before committing: incomplete recipes remain editable,
while invalid supplied facts reject the whole revisioned transaction. The browser has no model-field validation
table and never deletes inputs merely because a new model does not accept them.

Exact Build outputs and an explicit selected Product remain Workspace facts; their readiness and content remain
Host observations. The Canvas Host can submit a Build when its execution adapter is available and materialize
an explicitly selected Product when its Result and materialization adapters are available. The snapshot
reports those capabilities separately. A combined edit can write both the recipe and its Workspace.
The [Canvas Host](src/node/canvas-server.ts) writes these files in sequence. If the second write fails,
the first file can already contain the new revision. A retry must account for the state actually saved.

The Scene presentation reads objects, cameras, environment and local performances from the real
Scene Project. It opens or creates a sibling `*.scene-view.json`, loads project-relative GLB or self-contained glTF assets
through a controlled Host resource route, and commits one `object.transform.set` transaction when a
gizmo gesture ends. Object and Track locks remain Scene View facts. Orbit camera, selection, active
Static/Dynamic mode, and playhead remain browser Session state. Static and Dynamic editing are two
modes over the same Scene Project; switching modes never copies or overwrites a second scene.

The current Scene surface also resolves each explicitly selected Scene Library and renders its declared
collection hierarchy; choosing an asset creates an ordinary Object, Camera, or Environment replacement.
The hierarchy and viewport can select objects and cameras. The inspector persists base Transform and Lens
facts and package-owned Environment parameters. Position, rotation, and scale gizmos are base-scene tools;
the current material-color, opacity, and rigid-rig pose controls only preview the loaded model and are not
saved authoring facts. The Host already exposes generic package-owned Object and Behavior parameter edit
routes, but a browser control must use one of those owners before it can claim persistence. Dynamic mode
can switch the active Performance, select a subject Track, Behavior Item, or Shot, scrub and zoom time, and
persist Track locks. Monitoring is explicit: Shot output follows the authored camera cuts, Camera monitoring
holds one selected moving camera, and Director monitoring evaluates object motion while retaining the free
orbit view. Those choices, timeline selection, zoom, and playhead remain browser Session state. Dynamic mode
intentionally provides no direct curve or keyframe handles. Undo, redo, save, locks, environment presets,
and camera recipes all return the next complete Scene snapshot.

The [Scene Host](src/node/scene-server.ts) currently evaluates every Performance at the View edit rate
when building that snapshot. Even an editor-only lock change returns the objects and cameras for
each sampled frame. The [CLI](src/cli-command.ts) selects behavior packages from the document as
it opens. Adding the first use of a new behavior package during that session can leave an editable
Performance without executable preview frames until the Host reopens the document.

Clean Scene output is available through the same package:

```bash
hypit scene record shot.scene.json --performance performance-id --to output.mp4
```

It records the authored Shot camera sequence without Workbench UI and delivers H.264 picture. The command
does not record editor orbit, selection, panels, or a Timeline, and it currently emits no audio. Detailed
Scene semantics belong to `@hypit/scene`; package-specific motion and environment values belong to their
installed Scene packages rather than this Workbench.

The Scene timeline Export action runs the same recorder as an asynchronous Host task. It can follow the
authored cuts or hold one Camera, and can capture the complete Performance or one selected Shot or Behavior
Item. Completion publishes `media/<id>/<id>.media.json` beside the H.264 file, so Canvas and NLE discover it
through the existing project Media Library rather than through a Scene-specific export registry.
