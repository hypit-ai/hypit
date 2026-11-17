# `@hypit/nle-studio`

The Hypit NLE Product Session backend and browser client. An NLE Product Session leases an SVML Project and optional
NLE View through its `ProjectHost`, then exposes a finite same-origin projection to the browser client.

The package is an NLE product adapter, not another document owner. Project edits pass through `NleEditingSurface` to the
Project Service. Durable editor arrangement passes to the View Service. Selection, playhead and zoom stay in the
browser session. File reads, atomic writes and explicit reload belong to owner Providers in the local product adapter.
The Media catalog is the ProjectHost's shared Project Media Service; preview state arrives through its selected
Executor port.

The browser presents the editor in the viewport assigned to its Product Session.

Build and open the included project through the local product launcher from the repository root:

```sh
pnpm build
pnpm studio
```

The default address is `http://127.0.0.1:4317`. To open another project:

```sh
pnpm --filter @hypit/nle-studio start -- --root /absolute/path/to/project --document edits/main.svml
```

`--document` and `--view` are portable paths inside the selected Project Boundary. Pass `--view
edits/main.nle-view.json` when durable View state is wanted. Without it, the Product Session creates a session-only
View from the Project's root Composition. `--port` selects the loopback listener; port `0` asks the operating system
for an available port. The service always binds to `127.0.0.1`.

Current production behavior opens a finite Product projection, renders the Timeline, Canvas and Inspector, accepts
guarded commands, explicitly saves or reloads owner documents, imports local browser files, projects the shared Media
catalog and exposes delivery Actions when an `HtmlVideoExecutor` is injected by the distribution. `POST /api/observe`
selects one finite projection. Mutations return compact receipts, and the browser rereads only invalidated projections.
`GET /api/events` publishes document edits, Media Catalog changes and Delivery progress. On connection or reconnection,
Studio reads the current open projection.
Timeline drops use `POST /api/operate`. Studio resolves the selected Items, compatible unlocked Tracks, collisions
and Track creation in one guarded edit.
The same endpoint applies trim, multi-Item split, and removal. Callers can close a gap or ripple-remove a
contiguous interval by selecting an explicit Track scope. Studio offers a separate View reconciliation command
if a Project edit invalidates a View reference.
Studio handles Cmd/Ctrl+C, X and V through the session clipboard. Paste preserves relative timing and complete
audiovisual relations within the open NLE document. The Timeline exposes a separate action for pasted View Groups.
Studio can compound a contiguous single-Track selection and enter or return from a nested Composition. Returning
restores the parent playhead. The backend also supports making a nested definition unique and exploding a
full-duration, unmodified single-Track occurrence.
Audiovisual preview remains unavailable until a preview Executor port is supplied.

Available entries in the browser Media bin can be placed at the current playhead. Studio chooses a compatible Track,
creates one when needed, and returns the new Item identity. The structural Canvas displays accepted image and video
resources in their Present Item layout.

At session open, the backend assembles the selected packages' NLE authoring, Timeline presentation and Inspector
presentation contributions into the existing Editing Surface contracts. The browser creation bin projects selected
Component, Adjust and Transition offerings rather than mining already-created Items. Creating one sends an explicit
guarded materialization request; subsequent Component and Operator parameter edits use the package's Inspector and
authoring contributions.

Component packages may declare Media inputs dynamically from occurrence parameters. The Inspector presents
compatible Project Media for each slot and submits a guarded bind or unbind. A Component materialization caller
can also supply accepted Media identities by slot in the initial operation.

Inspector contributions may project stable finite collections as well as scalar fields. The Studio renders their
rows but still sends only the projected section/field identity and scalar value; package operation functions remain
in the backend and reduce the current closed value there. The Jensen caption package uses this for word text and
exact unit timing, while the ranking package uses it for tier rows and entries. Shared caption style edits address
the one Project Shared Value and therefore update all current users through one guarded transaction.

For every existing Component value slot, the Inspector also projects one Host-owned ownership selector. Selecting
“This item” copies a currently shared value inline; selecting a compatible named Project value links or rebinds the
occurrence. Both choices use the same package projector and reducer, while the Surface retains revision and Track
guard authority. A caller may additionally use the typed `component-value.edit` command to atomically share an inline
value under a new Project identity. Generic unlink never removes a required slot.

Under the Product Session URL, `POST /api/operate` handles Media, Component, Adjust, Transition and Composition
materialization and audio detachment. Studio converts session frames into exact NLE time and submits one revisioned
transaction per operation. Session-owned resource URLs at `api/resources/:token` support `GET`, `HEAD` and single
byte ranges.

`POST api/media/import?name=...` accepts one raw file body. The loopback adapter stages the upload, invokes the same
serialized Project Media adoption Action available to CLI and native callers, and deletes the staging file. The
accepted bytes and Media Asset manifest are copied below the project's `media/` collection. Import and NLE placement
are independent operations.

`POST api/deliveries` starts one export of the document already opened by the Product Session. `GET
api/deliveries/:handle` observes its project-local Action and `DELETE api/deliveries/:handle` cancels it. The default
Node distributions inject one shared local HTML Video Executor; these routes call the NLE Delivery Service directly,
whose Action owns its FFmpeg and Chromium children. The standalone server accepts
`HYPIT_FFMPEG_PATH`, `HYPIT_FFPROBE_PATH`, `HYPIT_CHROME_PATH` and `HYPIT_ELECTRON_PATH` for explicit executable
selection and otherwise uses the local implementations' ordinary defaults.

Timeline presentation resources use opaque `api/presentations/:resource` addresses and remain owned by the
process-local package contribution.
