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

Current production behavior opens and projects Project/View state, renders the finite Timeline, Canvas and Inspector,
accepts guarded commands, explicitly saves or reloads owner documents, imports local browser files, projects the
shared Media catalog and exposes delivery Actions when an `HtmlVideoExecutor` is injected by the distribution.
Audiovisual preview remains unavailable until a preview Executor port is supplied.

Available entries in the browser Media bin can be placed at the current playhead. The client chooses a compatible
unlocked Track or creates one, then submits the explicit media materialization request. Without a preview Executor,
the structural Canvas can display accepted image and video resources in their Present Item layout; that source display
does not claim to be composited programme output.

At session open, the backend assembles the selected packages' NLE authoring, Timeline presentation and Inspector
presentation contributions into the existing Editing Surface contracts. The browser creation bin projects selected
Component, Adjust and Transition offerings rather than mining already-created Items. Creating one sends an explicit
guarded materialization request; subsequent Component and Operator parameter edits use the package's Inspector and
authoring contributions.

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

Under the Product Session URL, the backend exposes `POST api/media/place` for one explicit catalog-to-NLE
materialization. It converts the session's frame coordinates into exact NLE time, calls the NLE Media planner and
submits the resulting ordinary revisioned transaction. Media bytes are exposed only through session-owned
`api/resources/:token` capability URLs;
the route supports `GET`, `HEAD` and single byte ranges without exposing absolute paths to the browser.

`POST api/media/import?name=...` accepts one raw file body. The loopback adapter stages the upload, invokes the same
serialized Project Media adoption Action available to CLI and native callers, and deletes the staging file. The
accepted bytes and Media Asset manifest are copied below the project's `media/` collection. Import and NLE placement
are independent operations.

`POST api/deliveries` starts one export of the document already opened by the Product Session. `GET
api/deliveries/:handle` observes its project-local Action and `DELETE api/deliveries/:handle` cancels it. The default
Node distributions inject one shared local HTML Video Executor; these routes call the NLE Delivery Service directly
and do not register FFmpeg, Chromium or the Action in the AIGC Execution Directory. The standalone server accepts
`HYPIT_FFMPEG_PATH`, `HYPIT_FFPROBE_PATH`, `HYPIT_CHROME_PATH` and `HYPIT_ELECTRON_PATH` for explicit executable
selection and otherwise uses the local implementations' ordinary defaults.

`POST api/catalog/components/materialize` materializes one Project-selected Component offering. Timeline
`POST api/catalog/adjusts/materialize` creates one timed effect, and
`POST api/catalog/transitions/materialize` atomically turns one direct cut into a selected Transition. Timeline
presentation resources use opaque `api/presentations/:resource` addresses and remain owned by the process-local
package contribution.
