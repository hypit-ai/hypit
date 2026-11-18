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

`--document` and `--view` are portable paths inside the selected Project Boundary. Studio uses the sibling
`main.nle-view.json` for `main.svml` by default and creates it when the View is first edited. Use `--view` to select
an existing View at a different path. `--port` selects the loopback listener. Port `0` uses an available port.
The service binds to `127.0.0.1`.

Current production behavior opens and projects Project/View state, renders the finite Timeline, Canvas and Inspector,
accepts guarded commands, and imports local browser files into the shared Media catalog. Studio saves Project
and View edits locally and prompts for a reload when an external edit conflicts.
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

Under the Product Session URL, the backend exposes `POST api/media/place` for one explicit catalog-to-NLE
materialization. It converts the session's frame coordinates into exact NLE time, calls the NLE Media planner and
submits the resulting ordinary revisioned transaction. Media bytes are exposed only through session-owned
`api/resources/:token` capability URLs;
the route supports `GET`, `HEAD` and single byte ranges without exposing absolute paths to the browser.

`POST api/media/import?name=...` accepts one raw file body. The loopback adapter stages the upload, invokes the same
serialized Project Media adoption Action available to CLI and native callers, and deletes the staging file. The
accepted bytes and Media Asset manifest are copied below the project's `media/` collection. Import and NLE placement
are independent operations.

`POST api/catalog/components/materialize` materializes one Project-selected Component offering. Timeline
`POST api/catalog/adjusts/materialize` creates one timed effect, and
`POST api/catalog/transitions/materialize` atomically turns one direct cut into a selected Transition. Timeline
presentation resources use opaque `api/presentations/:resource` addresses and remain owned by the process-local
package contribution.
