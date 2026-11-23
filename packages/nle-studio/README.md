# `@hypit/nle-studio`

The Hypit NLE Product Session backend and browser client. A session leases one SVML Project through its
`ProjectHost` and exposes finite same-origin projections to the browser client.

The package is an NLE product adapter, not another document owner. Project edits pass through `NleEditingSurface` to the
Project Service. The session owns Composition navigation and Track locks. Selection, playhead and zoom stay in the
browser session. File reads, atomic writes and explicit reload belong to owner Providers in the local product adapter.
The Media catalog is the ProjectHost's shared Project Media Service; preview state arrives through its selected
Executor port.

The browser presents the editor in the viewport assigned to its Product Session.

Build and open the included project through the shared Hypit Host from the repository root.

```sh
pnpm build
pnpm studio
```

Use the distribution's `hypit` command to select another project.

```sh
hypit nle open edits/main.svml --project /absolute/path/to/project
```

Select an SVML document inside the Project Boundary. The session starts at the root Composition, with the document's edit rate.
The shared Host publishes its loopback address on startup.

Current production behavior opens a finite Product projection, renders the Timeline, Canvas and Inspector, accepts
guarded commands, explicitly saves or reloads owner documents, imports local browser files, projects the shared Media
catalog and exposes delivery Actions when an `HtmlVideoExecutor` is injected by the distribution. `POST /api/observe`
selects one finite projection. Mutations return compact receipts, and the browser rereads only invalidated projections.
`GET /api/events` publishes document edits, Media Catalog changes and Delivery progress. On connection or reconnection,
Studio reads the current open projection.
Timeline drops use `POST /api/operate`. Studio resolves the selected Items, compatible unlocked Tracks, collisions
and Track creation in one guarded edit.
Dragging the full contents of contiguous Tracks into a gap moves those Tracks together. Track headers and gaps
can be used to interleave Picture and Audio Tracks in the SVML Composition's Track order.
The same endpoint applies trim, multi-Item split, and removal. Callers can close a gap or ripple-remove a
contiguous interval by selecting an explicit Track scope.
The Timeline reports the legal edit-frame range of each trim handle. Both projection and mutation use the resolved
source time and the Item's time maps. Move keeps those maps intact. Trim changes the visible window, and split
preserves its source coordinates in both pieces. The endpoint also supports timed source slip, direct-cut roll and end-edge
ripple trim. Media, Component and
Composition materialization can insert at a boundary by supplying an explicit destination and `insertTracks`.
Callers can retime a single affine Picture-only source window or create a new held Media Picture from a
selected forward sample with `media.freeze`.
Studio handles Cmd/Ctrl+C, X and V through the session clipboard. Paste preserves relative timing and complete
audiovisual relations and Groups within the open NLE document. Dragging a Group member moves the whole Group.
The Group control can create a Group, remove selected members or dissolve the selected Group.
Studio can compound a contiguous single-Track selection and enter or return from a nested Composition. Returning
restores the parent playhead. The backend also supports making a nested definition unique and exploding a
full-duration, unmodified single-Track occurrence.
Paused scrubbing and frame stepping reuse the active Composition's Picture Programme in a sandboxed browser
frame. Source media load on demand. When an accepted edit replaces the Programme, Studio waits for the new
document to paint at the current playhead before switching. Play advances the same document using native video
decoding where the source mapping permits it. The browser queues bounded PCM mixes on its audio clock. Exact
single-frame PNG and MP4 review Actions use the selected Chromium and Media toolchain.
During playback, the Timeline turns a page at the right edge. Horizontal scrolling or zoom disables following
for the current run, and pausing leaves the viewport where it is.

Available entries in the browser Media bin can be placed at the current playhead. Studio chooses a compatible Track,
creates one when needed, and returns the new Item identity. The structural Canvas displays accepted image and video
resources in their Present Item layout.

At session open, the backend assembles the selected packages' NLE Component definitions, authoring and Inspector
presentation contributions into the existing Editing Surface contracts. The browser creation bin projects selected
Component, Process, Adjust and Transition offerings. Creating one sends an explicit
guarded materialization request; subsequent Component and Operator parameter edits use the package's Inspector and
authoring contributions.

Process offerings attach to the compatible signal of a selected Present. The Inspector exposes each signal's order,
enable state and available parameters. Callers can enable, move or remove an exact Process through `POST /api/operate`.
Select a Process in the Inspector to align its Control interval to the Present start or end. Set its duration in
edit frames, or drag the inner handle of the selected interval on the clip. Both use `process.timing`. The clip trim
handle moves the Present edge and its aligned interval together.
Select a Timeline Transition to resize the overlap, edit available package fields or remove the relation. A
Transition offering can replace the selected relation, or create a relation from two Items at a direct cut. API
callers can also specify a Picture Track and a frame to identify the cut.

Component packages may declare Media inputs dynamically from occurrence parameters. The Inspector presents
compatible Project Media for each slot and submits a guarded bind or unbind. A Component materialization caller
can also supply accepted Media identities by slot in the initial operation.

Inspector contributions may project stable finite collections, scalar fields and row actions. Studio addresses
the projected field or action and the backend runs the package reducer on the current value. The Jensen caption
package uses fields for word text and exact unit timing. The ranking package uses row actions to reorder tiers.
Shared caption style edits update all current users through one guarded transaction.

For every existing Component value slot, the Inspector also projects one Host-owned ownership selector. Selecting
“This item” copies a currently shared value inline; selecting a compatible named Project value links or rebinds the
occurrence. Both choices use the same package projector and reducer, while the Surface retains revision and Track
guard authority. A caller may additionally use the typed `component-value.edit` command to atomically share an inline
value under a new Project identity. Generic unlink never removes a required slot.
During materialization, an offering's named values default to inline. Callers can use `values` to link a compatible
Project Shared Value or share the offered default under a new name in the same transaction as placement.

Under the Product Session URL, `POST /api/operate` handles Media, Component, Adjust, Transition and Composition
materialization and audio detachment. Studio converts session frames into exact NLE time and submits one revisioned
transaction per operation. Session-owned resource URLs at `api/resources/:token` support `GET`, `HEAD` and single
byte ranges.

`POST api/media/import?name=...` accepts one raw file body. The loopback adapter stages the upload, invokes the same
serialized Project Media adoption Action available to CLI and native callers, and deletes the staging file. The
accepted bytes and Media Asset manifest are copied below the project's `media/` collection. Import and NLE placement
are independent operations.

`POST /api/actions` starts frame preview, playback preview or delivery at the accepted Project revision. `GET
/api/actions/:handle` observes the Action and `DELETE /api/actions/:handle` requests cancellation. Completed
results have Session-owned resource URLs. The Preview observation supplies the Session Programme document URL
for seeking and continuous playback. Media, exact source frames, and audio buffers use generation-scoped URLs.
The Hypit Host accepts
`HYPIT_FFMPEG_PATH`, `HYPIT_FFPROBE_PATH`, `HYPIT_CHROME_PATH` and `HYPIT_ELECTRON_PATH` for explicit executable
selection and otherwise uses the local implementations' ordinary defaults.

Media thumbnail, storyboard, waveform and audio audition use the same Action endpoints. Supply an Asset identity
and the current Media Catalog generation. Timed views take positions on the Asset's Media clock.
The `programme-waveform` Action takes the active Composition, both revisions and a Programme frame range up
to two minutes. It returns the peak PNG of the same mix used for playback and delivery. A waveform request can
run alongside a frame or playback request.
The Media list, audio source monitor and Media clips call `media.source-preview` through the same
project-local cache. The list and monitor use the full Media clock. Studio maps visible Timeline cells and audio
intervals through each Item's source-time projection. Filmstrip blocks supply frame tiles. Waveform blocks
supply peak data at the requested resolution and Studio draws it at the current display scale.
Composition and visual Component clips use `picture.source-preview` to draw transparent frames on fixed source-time grids.
Composition clips with Audio use `audio.source-preview` to read cached numeric peaks from the child mix. The
Timeline maps the visible interval through the clip's source time and paints these blocks with the Media waveform renderer.
Studio can request a denser grid while displaying the coarse samples. The Product Session reuses frames when the compiled
HTML program and resources are equivalent. Composition samples use the child clock and are shared across occurrences.
Component samples use the placed Item window on the owning Composition's edit grid. They retain the Component's Picture
extent, source mapping and Item-local controls.

Each SVML Track declares its role. Text and subtitle Tracks read the plain text supplied by their Component
definitions. Filter and effect Tracks show authored Item names. Studio chooses the appearance by Track role and
draws source previews for Picture and Audio from Media and compiled Composition or Component outputs.

Studio autosaves Project edits to the SVML file.
When the file has changed on disk, Studio keeps the unsaved edits and reports the conflict. The notice offers to use
the file version and asks for confirmation before replacing the open edits.
The Timeline uses the Host’s resolved drop destination, trim ranges, and guarded operations.
