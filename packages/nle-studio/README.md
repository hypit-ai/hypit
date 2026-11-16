# `@hypit/nle-studio`

The standalone local Hypit NLE product. One process opens an SVML Project, an optional NLE View document and
the selected Media and preview ports, then serves the browser client and a small same-origin HTTP projection on
`127.0.0.1`.

The package is an NLE product adapter, not another document owner. Project edits pass through `NleEditingSurface` to the
Project Service. Durable editor arrangement passes to the View Service. Selection, playhead and zoom stay in the
browser session. File reads, atomic writes and explicit reload belong to the local Host. Media catalog and preview
state arrive through separate ports and are not reconstructed from NLE references.

The browser mounts the editor directly at the product root. It does not require a Desktop or Workbench wrapper; when
NLE is the only product, it occupies the complete viewport at the loopback address.

Build and open the included project from the repository root:

```sh
pnpm build
pnpm studio
```

The default address is `http://127.0.0.1:4317`. To open another project:

```sh
pnpm --filter @hypit/nle-studio start -- --project /absolute/path/to/project.svml
```

Pass `--view /absolute/path/to/view.json` when durable View state is wanted. Without it, the Host creates a
session-only View from the Project's root Composition. `--port` selects the loopback listener; port `0` asks the
operating system for an available port. The service always binds to `127.0.0.1`.

Current production behavior opens and projects Project/View state, renders the finite Timeline, Canvas and Inspector,
accepts guarded commands, and explicitly saves or reloads owner documents. Media import and audiovisual preview
remain absent until concrete Project Media Service and preview Executor ports are supplied.
